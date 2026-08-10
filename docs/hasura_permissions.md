# Hasura Permission Configuration & Workflow CRUD (Phase 4 & 5)

This document serves as the authoritative source for configuring Hasura Row-Level Permissions (RBAC) to enforce our Layer 1 and Layer 2 security models. 

> **Status:** Statically Validated
> **Note:** Because Nhost/Docker is unavailable locally, these rules cannot be runtime-verified in this environment. They must be applied to the Hasura Console upon deployment.

## 1. Security Architecture & Organization Isolation

Our security model relies on a single Hasura role: `user` (default for Nhost Auth). 
Instead of configuring multiple Hasura roles, **every permission dynamically joins against the `org_members` table** using the `X-Hasura-User-Id` session variable. 

This ensures:
1. Access is inherently scoped to the organization.
2. A single user can be an `owner` in Org A and a `viewer` in Org B simultaneously.
3. Guessing IDs (IDOR) is impossible because the row-level filter explicitly requires a matching path through the relationships to the authenticated user's ID.

### Column Validation Design (Layer 2 Support)
As requested, `workflow_steps.type` and `workflow_triggers.trigger_type` are explicit database columns with strict `CHECK` constraints, rather than JSONB config properties. This allows Hasura permissions to inspect them safely at the database layer.

---

## 2. Role Matrix

| Capability | OWNER | EDITOR | VIEWER |
| :--- | :--- | :--- | :--- |
| Read Org Data & Workflows | ✅ | ✅ | ✅ |
| Manage Org Members | ✅ | ❌ | ❌ |
| Create/Edit/Delete Workflows | ✅ | ✅ (No Delete) | ❌ |
| Create/Edit Normal Steps | ✅ | ✅ | ❌ |
| Create/Edit `db_write` / `notify` Steps | ✅ | ❌ | ❌ |
| Create/Edit Normal Triggers | ✅ | ✅ | ❌ |
| Create/Edit `webhook` Triggers | ✅ | ❌ | ❌ |
| Trigger Workflow Execution | ✅ | ✅ | ❌ |
| Approve Paused Gates | ✅ | ✅ | ❌ |

---

## 3. Authoritative Hasura Permission Rules (Role: `user`)

Apply these JSON boolean expressions to the corresponding operations in the Hasura Console. 

### A. `organizations`
- **SELECT:**
  ```json
  {"org_members": {"user_id": {"_eq": "X-Hasura-User-Id"}}}
  ```
- **INSERT / UPDATE / DELETE:** ❌ Denied. Handled strictly by the Node.js backend (`orgService.ts`).

### B. `org_members`
- **SELECT:**
  ```json
  {"organization": {"org_members": {"user_id": {"_eq": "X-Hasura-User-Id"}}}}
  ```
- **INSERT / UPDATE / DELETE:** ❌ Denied. Handled strictly by the Node.js backend to prevent privilege escalation.

### C. `workflows`
- **SELECT (Viewer, Editor, Owner):**
  ```json
  {"organization": {"org_members": {"user_id": {"_eq": "X-Hasura-User-Id"}}}}
  ```
- **INSERT / UPDATE (Editor, Owner):**
  *Note: Ensures the user is an owner or editor of the org they are inserting the workflow into. By joining on the relation, `organization_id` cannot be manipulated to move workflows to unauthorized orgs.*
  ```json
  {
    "organization": {
      "org_members": {
        "user_id": {"_eq": "X-Hasura-User-Id"},
        "role": {"_in": ["owner", "editor"]}
      }
    }
  }
  ```
- **DELETE (Owner Only):**
  ```json
  {
    "organization": {
      "org_members": {
        "user_id": {"_eq": "X-Hasura-User-Id"},
        "role": {"_eq": "owner"}
      }
    }
  }
  ```

### D. `workflow_steps`
- **SELECT:**
  ```json
  {"workflow": {"organization": {"org_members": {"user_id": {"_eq": "X-Hasura-User-Id"}}}}}
  ```
- **INSERT / UPDATE (Layer 2 Enforcement):**
  *Note: Checks that ownership is derived through the parent workflow. Owners can insert any type. Editors are restricted from `db_write` and `notify`.*
  ```json
  {
    "_or": [
      {
        "_and": [
          {
            "workflow": {
              "organization": {
                "org_members": {
                  "user_id": {"_eq": "X-Hasura-User-Id"},
                  "role": {"_eq": "owner"}
                }
              }
            }
          }
        ]
      },
      {
        "_and": [
          {
            "workflow": {
              "organization": {
                "org_members": {
                  "user_id": {"_eq": "X-Hasura-User-Id"},
                  "role": {"_eq": "editor"}
                }
              }
            }
          },
          {
            "type": {"_nin": ["db_write", "notify"]}
          }
        ]
      }
    ]
  }
  ```
- **DELETE:**
  ```json
  {
    "workflow": {
      "organization": {
        "org_members": {
          "user_id": {"_eq": "X-Hasura-User-Id"},
          "role": {"_in": ["owner", "editor"]}
        }
      }
    }
  }
  ```

### E. `workflow_triggers`
- **SELECT:**
  ```json
  {"workflow": {"organization": {"org_members": {"user_id": {"_eq": "X-Hasura-User-Id"}}}}}
  ```
- **INSERT / UPDATE (Layer 2 Enforcement):**
  *Note: Editors cannot configure webhook triggers.*
  ```json
  {
    "_or": [
      {
        "_and": [
          {
            "workflow": {
              "organization": {
                "org_members": {
                  "user_id": {"_eq": "X-Hasura-User-Id"},
                  "role": {"_eq": "owner"}
                }
              }
            }
          }
        ]
      },
      {
        "_and": [
          {
            "workflow": {
              "organization": {
                "org_members": {
                  "user_id": {"_eq": "X-Hasura-User-Id"},
                  "role": {"_eq": "editor"}
                }
              }
            }
          },
          {
            "trigger_type": {"_neq": "webhook"}
          }
        ]
      }
    ]
  }
  ```
- **DELETE:**
  ```json
  {
    "workflow": {
      "organization": {
        "org_members": {
          "user_id": {"_eq": "X-Hasura-User-Id"},
          "role": {"_in": ["owner", "editor"]}
        }
      }
    }
  }
  ```

### F. `workflow_runs`, `step_runs`, `workflow_outputs`
- **SELECT (`workflow_runs`, `workflow_outputs`):**
  ```json
  {"workflow": {"organization": {"org_members": {"user_id": {"_eq": "X-Hasura-User-Id"}}}}}
  ```
- **SELECT (`step_runs`):**
  ```json
  {"workflow_run": {"workflow": {"organization": {"org_members": {"user_id": {"_eq": "X-Hasura-User-Id"}}}}}}
  ```
- **INSERT / UPDATE / DELETE:** ❌ Denied. The frontend must never mutate execution state directly. This is handled by the backend executor (via Hasura Actions with a secure service token).

---

## 4. GraphQL Testing Examples (Runtime Expected Behavior)

The following scenarios represent expected API responses when directly attacking the GraphQL endpoint.

**A. Org A owner → create workflow**
- **Payload:** `mutation { insert_workflows_one(object: {org_id: "ORG_A", name: "Test"}) { id } }`
- **Result:** `SUCCESS` (Returns Workflow ID)

**B. Org A editor → edit workflow**
- **Payload:** `mutation { update_workflows_by_pk(pk_columns: {id: "WORKFLOW_A"}, _set: {name: "Updated"}) { id } }`
- **Result:** `SUCCESS`

**C. Org A viewer → edit workflow**
- **Payload:** `mutation { update_workflows_by_pk(pk_columns: {id: "WORKFLOW_A"}, _set: {name: "Hacked"}) { id } }`
- **Result:** `DENIED` (Returns `null` or permission error because viewer is not in the `_in: ["owner", "editor"]` rule)

**D. Org B editor → read Org A workflow by guessed ID**
- **Payload:** `query { workflows_by_pk(id: "WORKFLOW_A") { id } }`
- **Result:** `DENIED` (Returns `null`. Rule requires user to exist in `org_members` for Org A).

**E. Org B editor → update Org A workflow by guessed ID**
- **Payload:** `mutation { update_workflows_by_pk(pk_columns: {id: "WORKFLOW_A"}, _set: {name: "Hacked"}) { id } }`
- **Result:** `DENIED`

**F. Org A editor → create `db_write` step**
- **Payload:** `mutation { insert_workflow_steps_one(object: {workflow_id: "WORKFLOW_A", type: "db_write", step_order: 1, name: "DB"}) { id } }`
- **Result:** `DENIED` (Fails the `_nin: ["db_write", "notify"]` condition for editors)

**G. Org A editor → create `notify` step**
- **Payload:** `mutation { insert_workflow_steps_one(...) }`
- **Result:** `DENIED`

**H. Org A editor → create `webhook` trigger**
- **Payload:** `mutation { insert_workflow_triggers_one(object: {workflow_id: "WORKFLOW_A", trigger_type: "webhook"}) { id } }`
- **Result:** `DENIED`

**I. Org A owner → create `db_write` step**
- **Payload:** `mutation { insert_workflow_steps_one(object: {workflow_id: "WORKFLOW_A", type: "db_write", step_order: 1, name: "DB"}) { id } }`
- **Result:** `SUCCESS`

**J. Org A owner → create `notify` step**
- **Payload:** `SUCCESS`

**K. Org A owner → create `webhook` trigger**
- **Payload:** `SUCCESS`
