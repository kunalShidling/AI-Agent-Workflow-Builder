# Webhook Trigger Documentation

## Endpoint
**POST** `{{NHOST_BACKEND_URL}}/api/webhookTrigger`

## Request Format
To trigger a workflow, an external system must make a POST request with the following structure:

### Headers
```http
Content-Type: application/json
X-Webhook-Secret: <YOUR_SECURE_WEBHOOK_SECRET>
```
*(The secret is explicitly managed via HTTP headers to keep it out of standard GraphQL payloads and away from ordinary users.)*

### Body (JSON)
```json
{
  "input": {
    "workflow_id": "8f8e5c1e-...",
    "payload": {
      "customer": "John Doe",
      "issue": "Login failure"
    }
  }
}
```

## Authentication & Configuration
Webhooks decouple execution from user sessions. Security relies on a **Webhook Secret**.
- **Storage:** The secret is stored in `workflow_triggers.config` (JSONB). 
- **Owner-Only Rule:** Hasura layer 2 permissions guarantee that only a user with the `owner` role in the organization can create or modify `workflow_triggers` where `trigger_type = 'webhook'`. Viewers and editors are actively blocked from managing triggers.
- **Validation:** The backend explicitly validates that the trigger is `enabled = true` and the `X-Webhook-Secret` matches exactly.

## Execution Context & Payload Propagation
The external `payload` is deeply embedded into the `ExecutionContext`.
LLM Steps or HTTP Steps can dynamically read the inbound payload using mustache-style variables:
```text
Analyze this issue for {{trigger.payload.customer}}: {{trigger.payload.issue}}
```

## Approval & Real-Time Behavior
Webhooks inherit **all** functionality of manual triggers seamlessly because they delegate to the exact same `WorkflowExecutor`:
1. If quota is exhausted, the HTTP POST is rejected instantly.
2. If the workflow reaches an `approval_gate`, it **pauses**.
3. Live React clients connected via the GraphQL Subscription will see the webhook-triggered run appear instantly (`trigger_type = 'webhook'`).
4. Organization owners/editors can use the dashboard to approve the paused webhook step.

## Replay/Idempotency Considerations
At present, full idempotency (e.g., `Idempotency-Key` headers caching responses for 24h) is not strictly implemented in this phase. External systems retrying a webhook payload will spawn duplicate `workflow_runs`. 

## Demonstration Command
```bash
curl -X POST https://your-nhost-project.url/api/webhookTrigger \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: WEBHOOK_SECRET" \
  -d '{
    "input": {
      "workflow_id": "WORKFLOW_ID",
      "payload": { "message": "Analyze customer sentiment" }
    }
  }'
```
