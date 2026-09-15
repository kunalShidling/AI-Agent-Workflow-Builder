# AI Agent Workflow Builder

A full-stack workflow automation platform that chains AI agents and HTTP logic together seamlessly. Built with a modern Serverless architecture designed for multi-tenant scalability, real-time feedback, and secure execution.

## Features
- **Multi-Tenant Architecture**: Strict organizational data isolation using Hasura Row-Level Security.
- **Workflow Engine**: Execute multi-step sequences combining LLM tasks, HTTP requests, conditional branches, and PostgreSQL writes.
- **Approval Gates**: Pause execution natively until an authorized `owner` or `editor` provides explicit approval.
- **Robust Triggers**: Run workflows manually, via webhooks, on database row changes, or on a cron schedule.
- **Real-Time Visibility**: Track execution natively through GraphQL subscriptions, updating the UI dynamically without page refreshes.
- **Quota & Resiliency**: Built-in exponential backoff retries, atomic deduplication, and strictly enforced execution quotas.

## Architecture

![Architecture Diagram](https://raw.githubusercontent.com/hasura/graphql-engine/master/assets/hasura-logo.png)

This project relies on the **Nhost** cloud stack, comprising:
- **Database**: PostgreSQL 14
- **GraphQL API**: Hasura v2.48
- **Authentication**: Nhost Auth
- **Execution Backend**: Nhost Serverless Functions (Node.js)
- **Frontend**: Next.js 14 App Router

### Folder Structure
- `frontend/` - Next.js React application with Apollo Client.
- `functions/` - Serverless Node.js endpoints running our Execution Engine.
- `nhost/` - Hasura metadata, migrations, and infrastructure configuration.
- `docs/` - Architectural documentation and compliance checklists.

## Local Development

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (for local database)
- `npm`

### Setup
1. Duplicate `.env.example` to `.env` in both `frontend` and `functions` (if applicable) and populate the values.
2. If testing the database locally, use `docker-compose up -d`.
3. In a terminal, run the frontend:
   ```bash
   cd frontend
   npm install --legacy-peer-deps
   npm run dev
   ```
4. Note: Since `nhost` CLI is unavailable for direct execution in this environment natively without WSL2, the serverless functions and Hasura metadata are intended to be deployed directly to Nhost Cloud for end-to-end integration. 

## Deployment

The application is deployed via Git integration to **Nhost Cloud** (Backend) and **Vercel** (Frontend).
1. Connect this repository to a new Nhost Project. Nhost will automatically apply `nhost/migrations` and `nhost/metadata`, and deploy the endpoints in `functions/` as Serverless Functions accessible at `{{NHOST_BACKEND_URL}}/v1/functions`.
2. Connect the `frontend/` folder to Vercel, providing the `NEXT_PUBLIC_NHOST_SUBDOMAIN` environment variable.

## Security Overview
- **No secrets in frontend**: All LLM and Webhook API Keys are maintained exclusively in backend environment variables and `workflow_triggers.config` (database).
- **Tenant Isolation**: Hasura explicitly blocks cross-org queries utilizing the `X-Hasura-User-Id` dynamic session variable evaluated against the `org_members` junction table.
- **SSRF Protection**: The HTTP workflow step strictly blocks private subnet ranges, loopback addresses, and AWS metadata IP resolutions.
- **Idempotency**: Execution scheduling and webhook triggers employ atomic PostgreSQL `UPDATE ... RETURNING` claims to guarantee no duplicate executions occur under race conditions.
