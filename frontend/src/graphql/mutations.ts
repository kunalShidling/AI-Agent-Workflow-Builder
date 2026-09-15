import { gql } from '@apollo/client';

export const CREATE_WORKFLOW = gql`
  mutation CreateWorkflow($name: String!, $description: String, $orgId: uuid!) {
    insert_workflows_one(object: { name: $name, description: $description, org_id: $orgId }) {
      id
    }
  }
`;

export const CREATE_STEP = gql`
  mutation CreateStep($workflowId: uuid!, $type: String!, $name: String!, $stepOrder: Int!) {
    insert_workflow_steps_one(object: {
      workflow_id: $workflowId,
      type: $type,
      name: $name,
      step_order: $stepOrder,
      config: {}
    }) {
      id
    }
  }
`;

export const UPDATE_WORKFLOW_STEP = gql`
  mutation UpdateWorkflowStep($id: uuid!, $config: jsonb!, $name: String!) {
    update_workflow_steps_by_pk(pk_columns: { id: $id }, _set: { config: $config, name: $name }) {
      id
    }
  }
`;

// Actions
export const TRIGGER_WORKFLOW_RUN = gql`
  mutation TriggerWorkflowRun($workflowId: uuid!) {
    triggerWorkflowRun(input: { workflow_id: $workflowId }) {
      workflow_run_id
      status
    }
  }
`;

export const APPROVE_STEP = gql`
  mutation ApproveStep($stepRunId: uuid!) {
    approveStep(input: { step_run_id: $stepRunId }) {
      success
      step_run_id
    }
  }
`;
