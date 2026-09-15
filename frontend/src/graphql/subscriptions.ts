import { gql } from '@apollo/client';

// This subscription utilizes Hasura's relationships.
// `step_runs` is ordered by `workflow_step.step_order` ascending to ensure consistent UI ordering.
export const WATCH_WORKFLOW_RUN = gql`
  subscription WatchWorkflowRun($workflowRunId: uuid!) {
    workflow_runs(where: { id: { _eq: $workflowRunId } }) {
      id
      status
      started_at
      paused_at
      completed_at
      error
      step_runs(order_by: { workflow_step: { step_order: asc } }) {
        id
        workflow_step_id
        status
        input
        output
        error
        attempt_count
        approved_by
        approved_at
        started_at
        completed_at
        workflow_step {
          id
          name
          type
          step_order
        }
      }
    }
  }
`;
