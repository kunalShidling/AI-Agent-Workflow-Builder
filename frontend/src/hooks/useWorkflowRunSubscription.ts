import { useSubscription } from '@apollo/client';
import { WATCH_WORKFLOW_RUN } from '../graphql/subscriptions';

export function useWorkflowRunSubscription(workflowRunId: string) {
  const { data, loading, error } = useSubscription(WATCH_WORKFLOW_RUN, {
    variables: { workflowRunId },
    skip: !workflowRunId, // Don't subscribe if ID is null/undefined
  });

  const workflowRun = data?.workflow_runs?.[0] || null;
  const stepRuns = workflowRun?.step_runs || [];

  return {
    workflowRun,
    stepRuns,
    loading,
    error,
  };
}
