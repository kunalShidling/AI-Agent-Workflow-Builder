const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'nhost', 'metadata');
const tablesDir = path.join(root, 'databases', 'default', 'tables');

fs.mkdirSync(tablesDir, { recursive: true });

function writeYaml(filePath, content) {
    fs.writeFileSync(filePath, content.trim() + '\n');
}

// 1. version.yaml
writeYaml(path.join(root, 'version.yaml'), `version: 3`);

// 2. databases/databases.yaml
writeYaml(path.join(root, 'databases', 'databases.yaml'), `
- name: default
  kind: postgres
  configuration:
    connection_info:
      database_url:
        from_env: HASURA_GRAPHQL_DATABASE_URL
      isolation_level: read-committed
      use_prepared_statements: false
  tables: "!include default/tables/tables.yaml"
`);

// 3. tables.yaml
writeYaml(path.join(tablesDir, 'tables.yaml'), `
- "!include public_organizations.yaml"
- "!include public_org_members.yaml"
- "!include public_workflows.yaml"
- "!include public_workflow_steps.yaml"
- "!include public_workflow_triggers.yaml"
- "!include public_workflow_runs.yaml"
- "!include public_step_runs.yaml"
- "!include public_workflow_outputs.yaml"
`);

// 4. public_organizations.yaml
writeYaml(path.join(tablesDir, 'public_organizations.yaml'), `
table:
  name: organizations
  schema: public
array_relationships:
  - name: org_members
    using:
      foreign_key_constraint_on:
        column: org_id
        table:
          name: org_members
          schema: public
  - name: workflows
    using:
      foreign_key_constraint_on:
        column: org_id
        table:
          name: workflows
          schema: public
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - name
        - calls_used
        - calls_allowed
        - quota_period_start
        - created_at
        - updated_at
      filter:
        org_members:
          user_id:
            _eq: X-Hasura-User-Id
`);

// 5. public_org_members.yaml
writeYaml(path.join(tablesDir, 'public_org_members.yaml'), `
table:
  name: org_members
  schema: public
object_relationships:
  - name: organization
    using:
      foreign_key_constraint_on: org_id
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - org_id
        - user_id
        - role
        - created_at
      filter:
        organization:
          org_members:
            user_id:
              _eq: X-Hasura-User-Id
`);

// 6. public_workflows.yaml
writeYaml(path.join(tablesDir, 'public_workflows.yaml'), `
table:
  name: workflows
  schema: public
object_relationships:
  - name: organization
    using:
      foreign_key_constraint_on: org_id
array_relationships:
  - name: workflow_steps
    using:
      foreign_key_constraint_on:
        column: workflow_id
        table:
          name: workflow_steps
          schema: public
  - name: workflow_triggers
    using:
      foreign_key_constraint_on:
        column: workflow_id
        table:
          name: workflow_triggers
          schema: public
  - name: workflow_runs
    using:
      foreign_key_constraint_on:
        column: workflow_id
        table:
          name: workflow_runs
          schema: public
  - name: workflow_outputs
    using:
      foreign_key_constraint_on:
        column: workflow_id
        table:
          name: workflow_outputs
          schema: public
insert_permissions:
  - role: user
    permission:
      check:
        organization:
          org_members:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - role:
                  _in:
                    - owner
                    - editor
      columns:
        - org_id
        - name
        - description
        - status
        - created_by
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - org_id
        - name
        - description
        - status
        - created_by
        - created_at
        - updated_at
      filter:
        organization:
          org_members:
            user_id:
              _eq: X-Hasura-User-Id
update_permissions:
  - role: user
    permission:
      columns:
        - name
        - description
        - status
      filter:
        organization:
          org_members:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - role:
                  _in:
                    - owner
                    - editor
      check: null
delete_permissions:
  - role: user
    permission:
      filter:
        organization:
          org_members:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - role:
                  _eq: owner
`);

// 7. public_workflow_steps.yaml
writeYaml(path.join(tablesDir, 'public_workflow_steps.yaml'), `
table:
  name: workflow_steps
  schema: public
object_relationships:
  - name: workflow
    using:
      foreign_key_constraint_on: workflow_id
insert_permissions:
  - role: user
    permission:
      check:
        _or:
          - _and:
              - workflow:
                  organization:
                    org_members:
                      user_id:
                        _eq: X-Hasura-User-Id
                      role:
                        _eq: owner
          - _and:
              - workflow:
                  organization:
                    org_members:
                      user_id:
                        _eq: X-Hasura-User-Id
                      role:
                        _eq: editor
              - type:
                  _nin:
                    - db_write
                    - notify
      columns:
        - workflow_id
        - step_order
        - name
        - type
        - config
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - workflow_id
        - step_order
        - name
        - type
        - config
        - created_at
        - updated_at
      filter:
        workflow:
          organization:
            org_members:
              user_id:
                _eq: X-Hasura-User-Id
update_permissions:
  - role: user
    permission:
      columns:
        - step_order
        - name
        - type
        - config
      filter:
        _or:
          - _and:
              - workflow:
                  organization:
                    org_members:
                      user_id:
                        _eq: X-Hasura-User-Id
                      role:
                        _eq: owner
          - _and:
              - workflow:
                  organization:
                    org_members:
                      user_id:
                        _eq: X-Hasura-User-Id
                      role:
                        _eq: editor
              - type:
                  _nin:
                    - db_write
                    - notify
      check: null
delete_permissions:
  - role: user
    permission:
      filter:
        workflow:
          organization:
            org_members:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - role:
                    _in:
                      - owner
                      - editor
`);

// 8. public_workflow_triggers.yaml
writeYaml(path.join(tablesDir, 'public_workflow_triggers.yaml'), `
table:
  name: workflow_triggers
  schema: public
object_relationships:
  - name: workflow
    using:
      foreign_key_constraint_on: workflow_id
insert_permissions:
  - role: user
    permission:
      check:
        _or:
          - _and:
              - workflow:
                  organization:
                    org_members:
                      user_id:
                        _eq: X-Hasura-User-Id
                      role:
                        _eq: owner
          - _and:
              - workflow:
                  organization:
                    org_members:
                      user_id:
                        _eq: X-Hasura-User-Id
                      role:
                        _eq: editor
              - trigger_type:
                  _neq: webhook
      columns:
        - workflow_id
        - trigger_type
        - config
        - enabled
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - workflow_id
        - trigger_type
        - config
        - enabled
        - created_at
        - updated_at
      filter:
        workflow:
          organization:
            org_members:
              user_id:
                _eq: X-Hasura-User-Id
update_permissions:
  - role: user
    permission:
      columns:
        - config
        - enabled
        - trigger_type
      filter:
        _or:
          - _and:
              - workflow:
                  organization:
                    org_members:
                      user_id:
                        _eq: X-Hasura-User-Id
                      role:
                        _eq: owner
          - _and:
              - workflow:
                  organization:
                    org_members:
                      user_id:
                        _eq: X-Hasura-User-Id
                      role:
                        _eq: editor
              - trigger_type:
                  _neq: webhook
      check: null
delete_permissions:
  - role: user
    permission:
      filter:
        workflow:
          organization:
            org_members:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - role:
                    _in:
                      - owner
                      - editor
`);

// 9. public_workflow_runs.yaml
writeYaml(path.join(tablesDir, 'public_workflow_runs.yaml'), `
table:
  name: workflow_runs
  schema: public
object_relationships:
  - name: workflow
    using:
      foreign_key_constraint_on: workflow_id
array_relationships:
  - name: step_runs
    using:
      foreign_key_constraint_on:
        column: workflow_run_id
        table:
          name: step_runs
          schema: public
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - workflow_id
        - trigger_type
        - status
        - started_at
        - completed_at
        - paused_at
        - error
        - created_by
        - created_at
        - updated_at
      filter:
        workflow:
          organization:
            org_members:
              user_id:
                _eq: X-Hasura-User-Id
`);

// 10. public_step_runs.yaml
writeYaml(path.join(tablesDir, 'public_step_runs.yaml'), `
table:
  name: step_runs
  schema: public
object_relationships:
  - name: workflow_run
    using:
      foreign_key_constraint_on: workflow_run_id
  - name: workflow_step
    using:
      foreign_key_constraint_on: workflow_step_id
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - workflow_run_id
        - workflow_step_id
        - status
        - input
        - output
        - error
        - attempt_count
        - approved_by
        - approved_at
        - started_at
        - completed_at
        - created_at
        - updated_at
      filter:
        workflow_run:
          workflow:
            organization:
              org_members:
                user_id:
                  _eq: X-Hasura-User-Id
`);

// 11. public_workflow_outputs.yaml
writeYaml(path.join(tablesDir, 'public_workflow_outputs.yaml'), `
table:
  name: workflow_outputs
  schema: public
object_relationships:
  - name: workflow
    using:
      foreign_key_constraint_on: workflow_id
  - name: workflow_run
    using:
      foreign_key_constraint_on: workflow_run_id
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - workflow_run_id
        - workflow_id
        - data
        - created_at
      filter:
        workflow:
          organization:
            org_members:
              user_id:
                _eq: X-Hasura-User-Id
`);

// 12. actions.yaml
writeYaml(path.join(root, 'actions.yaml'), `
actions:
  - name: triggerWorkflowRun
    definition:
      handler: "{{NHOST_BACKEND_URL}}/api/triggerWorkflowRun"
      forward_client_headers: true
      headers:
        - name: Authorization
          value_from_env: NHOST_WEBHOOK_SECRET
  - name: approveStep
    definition:
      handler: "{{NHOST_BACKEND_URL}}/api/approveStep"
      forward_client_headers: true
      headers:
        - name: Authorization
          value_from_env: NHOST_WEBHOOK_SECRET
  - name: webhookTrigger
    definition:
      handler: "{{NHOST_BACKEND_URL}}/api/webhookTrigger"
      forward_client_headers: true
custom_types:
  enums: []
  input_objects:
    - name: TriggerInput
    - name: ApproveInput
    - name: WebhookTriggerInput
  objects:
    - name: TriggerResponse
    - name: ApproveResponse
    - name: WebhookTriggerResponse
  scalars: []
`);

// 13. actions.graphql
const actionsGraphql = [
  "type TriggerResponse {",
  "  workflow_run_id: uuid!",
  "  status: String!",
  "}",
  "",
  "input TriggerInput {",
  "  workflow_id: uuid!",
  "}",
  "",
  "type ApproveResponse {",
  "  success: Boolean!",
  "  step_run_id: uuid!",
  "}",
  "",
  "input ApproveInput {",
  "  step_run_id: uuid!",
  "}",
  "",
  "type WebhookTriggerResponse {",
  "  workflow_run_id: uuid!",
  "  status: String!",
  "}",
  "",
  "input WebhookTriggerInput {",
  "  workflow_id: uuid!",
  "  payload: jsonb",
  "}",
  "",
  "type Mutation {",
  "  triggerWorkflowRun(input: TriggerInput!): TriggerResponse",
  "}",
  "",
  "type Mutation {",
  "  approveStep(input: ApproveInput!): ApproveResponse",
  "}",
  "",
  "type Mutation {",
  "  webhookTrigger(input: WebhookTriggerInput!): WebhookTriggerResponse",
  "}"
].join('\\n');

writeYaml(path.join(root, 'actions.graphql'), actionsGraphql);

console.log("Metadata generated successfully.");
