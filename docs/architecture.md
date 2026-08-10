# Architecture & Security Design

This document details the architecture of the AI Agent Workflow Builder. 

## 1. Authentication Mechanism
Authentication is entirely handled by Nhost Auth (which interfaces with Hasura Auth). The frontend authenticates via Nhost and receives a JWT.
Every HTTP request to our backend (whether a direct call or via a Hasura Action) relies exclusively on the `X-Hasura-User-Id` session variable injected by the API gateway. **We completely ignore any user ID passed via request body** to prevent forgery.

## 2. Authorization Mechanism (Layer 1 & Layer 2)
- **Layer 1 (Tenant Isolation):** Every database operation and backend action queries the `org_members` table linking the authenticated `X-Hasura-User-Id` to the target entity's `organization_id`. We never simply check `if (role === 'owner')`; we always check `if (user_in_org AND role === 'owner')`.
- **Layer 2 (Step-Level Enforcement):** Restricting specific capabilities (e.g., adding `db_write` or `webhook` triggers) is enforced both through Hasura's native Row-Level Permissions using `_or` conditions on the explicit `type` column, and through backend handler checks.

## 3. triggerWorkflowRun Flow
1. Receives GraphQL mutation intercepted by Hasura Action.
2. Extracts `X-Hasura-User-Id` and verifies the caller is an `owner` or `editor` of the workflow's organization.
3. Checks quota (`organizations.calls_used < calls_allowed`) and increments it.
4. Generates a `workflow_runs` row with `status = 'running'`.
5. Asynchronously hands off to the `WorkflowExecutor`.
6. Instantly returns the `workflow_run_id` and `status` to the client.

## 4. Quota Behavior
Quota is rigorously enforced at execution time. `quotaService.ts` executes an atomic `UPDATE organizations SET calls_used = calls_used + 1 WHERE calls_used < calls_allowed`. If the update fails (returns 0 rows), the quota is exhausted, and the transaction aborts, preventing execution.

## 5. approveStep Flow & Concurrency Protection
1. Receives GraphQL mutation intercepted by Hasura Action containing `step_run_id`.
2. Resolves relationships (`step_run` ➔ `workflow_run` ➔ `workflow` ➔ `org_members`) to verify the caller is an `owner` or `editor` in that organization.
3. Verifies the step is an `approval_gate` and `status = 'paused'`.
4. **Concurrency Protection:** Performs an atomic update: `UPDATE step_runs SET status = 'completed' WHERE id = ? AND status = 'paused'`. If two editors click "Approve" simultaneously, only the first transaction modifies the row; the second receives 0 rows affected and fails with a clear message.
5. Invokes `resumeWorkflowRun`.

## 6. Workflow Execution & Resume Behavior
The `WorkflowExecutor` sequentially loops over the steps.
If an `approval_gate` step handler returns a `PAUSED` signal, the executor immediately updates the run to `paused`, sets `paused_at`, and exits.
When `resumeWorkflowRun(workflowRunId, startFromStepOrder)` is called, it re-queries the completed steps from `step_runs`, reconstructs the JSON `ExecutionContext` output accumulator, and resumes the loop exactly where it left off.

## 7. Real-Time Subscriptions
The platform achieves real-time visual feedback without polling by utilizing Hasura's GraphQL Subscriptions over WebSockets.
Because our backend `WorkflowExecutor` persists every discrete state transition (`running` -> `paused` -> `completed`) directly to PostgreSQL using `UPDATE` statements, Hasura's event/replication engine instantly broadcasts these mutations to connected clients.
Security for subscriptions is strictly enforced via the same Layer 1 Row-Level Security used for queries and mutations. An attacker attempting to subscribe to a `workflow_run_id` outside their organization will simply receive an empty payload without exposing any information.

## 8. Webhook Triggers (Machine-to-Machine)
External systems can start workflows via the `webhookTrigger` endpoint.
- **Authentication:** Relies on a per-trigger secret passed via `X-Webhook-Secret`. It does NOT use Nhost JWTs.
- **Context Injection:** External payloads are dynamically injected into the `ExecutionContext`, allowing nodes to reference data via `{{trigger.payload.fieldName}}`.
- **Inherited Features:** Because the webhook simply prepares the context and calls `triggerWorkflowRun`, all existing quota validation, approval pausing, and real-time subscription broadcasting happen automatically without duplicating code.
