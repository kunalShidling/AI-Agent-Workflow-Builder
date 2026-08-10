# Hasura Actions Configuration

This document provides the authoritative metadata definitions for our two core entry points: `triggerWorkflowRun` and `approveStep`.

> **Status:** Statically Validated
> **Note:** Because Nhost/Hasura is unavailable locally, these definitions must be entered in the Hasura Console or converted to YAML during deployment.

## 1. Action: `triggerWorkflowRun`

### Action Definition
**Action Name:** `triggerWorkflowRun`
**Type:** Mutation
**Handler URL:** `{{NHOST_BACKEND_URL}}/api/triggerWorkflowRun`
*(In a Next.js environment, this would point to `/api/triggerWorkflowRun`, or in Express, whatever the route is).*

### Types
```graphql
type TriggerResponse {
  workflow_run_id: uuid!
  status: String!
}

input TriggerInput {
  workflow_id: uuid!
}

type Mutation {
  triggerWorkflowRun(input: TriggerInput!): TriggerResponse
}
```

### Authentication Behavior
Hasura passes the authenticated user context securely via `session_variables`. 
The handler explicitly extracts `x-hasura-user-id` and completely ignores any forged identifying fields in the body.

---

## 2. Action: `approveStep`

### Action Definition
**Action Name:** `approveStep`
**Type:** Mutation
**Handler URL:** `{{NHOST_BACKEND_URL}}/api/approveStep`

### Types
```graphql
type ApproveResponse {
  success: Boolean!
  step_run_id: uuid!
}

input ApproveInput {
  step_run_id: uuid!
}

type Mutation {
  approveStep(input: ApproveInput!): ApproveResponse
}
```

### Authentication Behavior
Similarly, this intercepts `x-hasura-user-id` to perform deep organizational relationship checks, preventing cross-tenant approval spoofing.

---

## 3. GraphQL Mutation Examples

**Trigger Workflow:**
```graphql
mutation trigger {
  triggerWorkflowRun(input: {
    workflow_id: "0a1b2c3d-..."
  }) {
    workflow_run_id
    status
  }
}
```
*Expected Response:* `{ "data": { "triggerWorkflowRun": { "workflow_run_id": "...", "status": "running" } } }`

**Approve Step:**
```graphql
mutation approve {
  approveStep(input: {
    step_run_id: "0a1b2c3d-..."
  }) {
    success
    step_run_id
  }
}
```
*Expected Response:* `{ "data": { "approveStep": { "success": true, "step_run_id": "..." } } }`

## 4. Error Responses
Our Node.js handlers throw standard Error instances which Hasura converts into standard GraphQL errors (HTTP 400).
Examples:
- `{"errors": [{"message": "Unauthorized: only owner or editor can trigger workflows"}]}`
- `{"errors": [{"message": "Quota exceeded or organization not found"}]}`
- `{"errors": [{"message": "Approval failed: state was modified concurrently or no longer valid"}]}`

---

## 5. Action: `webhookTrigger` (External Integration)

### Action Definition
**Action Name:** `webhookTrigger`
**Type:** Mutation
**Handler URL:** `{{NHOST_BACKEND_URL}}/api/webhookTrigger`

### Types
```graphql
type WebhookTriggerResponse {
  workflow_run_id: uuid!
  status: String!
}

input WebhookTriggerInput {
  workflow_id: uuid!
  payload: jsonb
}

type Mutation {
  webhookTrigger(input: WebhookTriggerInput!): WebhookTriggerResponse
}
```

### Authentication Behavior
Unlike `triggerWorkflowRun` and `approveStep`, this Action is invoked by **external systems**. It does NOT use `x-hasura-user-id`. Instead, the backend handler extracts an `x-webhook-secret` HTTP header and rigorously matches it against `workflow_triggers.config.secret`. If the secret is invalid, disabled, or missing, it fails.
