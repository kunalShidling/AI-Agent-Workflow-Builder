# AI Agent Workflow Builder

A full-stack workflow automation platform that chains AI agents and HTTP logic together seamlessly.

## Backend
- Nhost Auth & PostgreSQL
- Hasura GraphQL Engine (Subscriptions, Mutations, Queries)
- Node.js Workflow Executor (Webhook triggers, Real-time persistence, Approval state machines)

## Frontend
- Next.js (App Router)
- Nhost Apollo Client
- React Context (OrgProvider)

## Setup & Running
1. `docker-compose up -d` (If testing Hasura locally)
2. `cd backend && npm install && npm run dev`
3. `cd frontend && npm install && npm run dev`
4. Access the UI at `http://localhost:3000/login`

## Testing Security
Run the test suites in `backend/tests/` to verify the execution engine and real-time mock evaluations. 
For UI testing, utilize the Next.js frontend by switching between owner, editor, and viewer accounts. Hasura's Row-Level Security explicitly guards the GraphQL edge preventing cross-org leakage and unauthorized approvals, completely decoupling security from UI rendering.
