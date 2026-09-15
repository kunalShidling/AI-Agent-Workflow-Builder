# Assignment Compliance Matrix

This document traces the assignment's technical and product requirements to their concrete implementations within the codebase.

| Requirement | Implementation Summary | File / Location | Status |
| :--- | :--- | :--- | :--- |
| **Organizations & Members** | Multi-tenant structure leveraging `organizations` and `org_members` tables. | `nhost/migrations/default/001_initial_schema/up.sql` | ✅ PASS |
| **RBAC Roles** | Viewer, Editor, Owner definitions in DB; enforced by Hasura policies and Node handlers. | `nhost/metadata/databases/default/tables/public_workflows.yaml`, `functions/_shared/actions/approveStep.ts` | ✅ PASS |
| **Workflows & Steps** | Schema tables mapped. Step ordering enforced. | `001_initial_schema/up.sql` | ✅ PASS |
| **Execution State Machine** | Tracking queued, running, paused, completed, failed for both runs and step runs. | `functions/_shared/executor/workflowExecutor.ts` | ✅ PASS |
| **LLM Step** | Call external AI models via Node.js backend. | `functions/_shared/steps/llmHandler.ts` | ✅ PASS |
| **HTTP Request Step** | Fetch integration with SSRF IP filtering and timeout protections. | `functions/_shared/steps/httpHandler.ts` | ✅ PASS |
| **Conditional Branching** | Execution evaluates prior step output to determine continuation. | `functions/_shared/steps/conditionalHandler.ts`, `workflowExecutor.ts` | ✅ PASS |
| **Approval Gate** | Execution pauses. Resumes asynchronously upon verified role action. | `functions/_shared/actions/approveStep.ts` | ✅ PASS |
| **Manual Trigger** | GraphQL Mutation `triggerWorkflowRun` via Nhost Serverless Actions. | `functions/triggerWorkflowRun.ts` | ✅ PASS |
| **Webhook Trigger** | Authenticated via constant-time crypto comparison. | `functions/webhookTrigger.ts` | ✅ PASS |
| **Scheduled Trigger** | Cron evaluation via `cron-parser` and atomic deduplication locks. | `functions/scheduledTrigger.ts` | ✅ PASS |
| **Database Event Trigger** | Hasura Event Triggers securely propagate `old`/`new` row payloads to Executor. | `functions/dbEventTrigger.ts` | ✅ PASS |
| **Tenant Isolation** | Deep graph authorization checks preventing cross-org resource leakage. | `nhost/metadata/databases/default/tables/*`, `authorizationService.ts` | ✅ PASS |
| **Retry Mechanism** | Bounded exponential backoff (max 2 retries) with jitter for transient errors. | `functions/_shared/executor/stepExecutor.ts` | ✅ PASS |
| **Quota Mechanism** | Transactional `UPDATE ... RETURNING` to enforce max execution limits securely. | `functions/_shared/services/quotaService.ts` | ✅ PASS |
| **GraphQL Subscriptions** | Real-time `WatchWorkflowRun` query polling Hasura directly. | `frontend/src/graphql/subscriptions.ts` | ✅ PASS |
| **Frontend Framework** | Next.js App Router providing dashboard, workflow builder, and live UI. | `frontend/src/app/*` | ✅ PASS |

## Security Hardening Additions
- **SSRF Blocklist:** Defends HTTP Steps from querying internal cloud networks.
- **Atomic Locks:** Defends Quota and Cron executions against concurrent high-volume race conditions.
- **Timing Attack Prevention:** Webhooks utilize `crypto.timingSafeEqual()`.
