# Real-Time Execution Architecture

Our workflow builder relies on a fully real-time execution model powered by Hasura GraphQL Subscriptions over WebSockets.

## 1. Why Polling is Not Required
Traditional workflow engines often require the frontend client to `setInterval` and HTTP GET the run status every X seconds. This is inefficient and causes visual latency.
Instead, we use Hasura Subscriptions. When the backend Node.js `WorkflowExecutor` executes a PostgreSQL `UPDATE step_runs SET status = 'completed'`, PostgreSQL's replication log notifies Hasura, which instantly pushes a WebSocket frame to any subscribed React clients.

## 2. Organization Isolation (Security)
The subscription `WatchWorkflowRun` is secured inherently at Layer 1 by Hasura's Row-Level Security.
When a client connects to the WebSocket:
1. Hasura validates the Nhost JWT.
2. Extracts `x-hasura-user-id`.
3. Evaluates the `SELECT` permission for `workflow_runs`.
4. The permission checks `workflow_run.workflow.organization.org_members` to ensure the user belongs to the org.
If an attacker from Org B requests a `workflow_run_id` from Org A, the subscription simply yields `null` (or an empty array), leaking zero information.

## 3. Expected Client Event Sequence
Because the Node executor correctly updates the database at every transition, the frontend will automatically observe this sequence over the WebSocket:

1. **Step 1 Started**: `step_run` ➔ `status = running`
2. **Step 1 Finished**: `step_run` ➔ `status = completed`, `output = {...}`
3. **Approval Gate Reached**: 
   - `step_run` ➔ `status = paused`
   - `workflow_run` ➔ `status = paused`
4. **Action `approveStep` Fired**: (Client explicitly mutates)
5. **Approval Resumed**:
   - `step_run` ➔ `status = completed`, `approved_by = <uuid>`
   - `workflow_run` ➔ `status = running`
6. **Workflow Finished**: `workflow_run` ➔ `status = completed`

## 4. Frontend Hook
The `useWorkflowRunSubscription(workflowRunId)` hook (using Apollo Client) abstracts this WebSocket connection away from the UI components, providing simple `{ workflowRun, stepRuns, loading }` reactive state variables.
