'use client';

import { useWorkflowRunSubscription } from '@/hooks/useWorkflowRunSubscription';
import { useMutation } from '@apollo/client';
import { APPROVE_STEP } from '@/graphql/mutations';
import { useOrg } from '@/components/OrgProvider';
import { format } from 'date-fns';

export function ExecutionTimeline({ workflowRunId }: { workflowRunId: string }) {
  const { workflowRun, stepRuns, loading } = useWorkflowRunSubscription(workflowRunId);
  const { role } = useOrg();
  const [approveStep] = useMutation(APPROVE_STEP);

  if (loading && !workflowRun) {
    return <div>Loading execution state...</div>;
  }

  if (!workflowRun) {
    return null;
  }

  const handleApprove = async (stepRunId: string) => {
    try {
      await approveStep({ variables: { stepRunId } });
    } catch (e: any) {
      alert('Approval failed: ' + e.message);
    }
  };

  const canApprove = role === 'owner' || role === 'editor';

  return (
    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
        Live Execution Status:
        <span style={{
          marginLeft: '0.5rem',
          color: workflowRun.status === 'completed' ? 'green' : workflowRun.status === 'failed' ? 'red' : 'orange'
        }}>
          {workflowRun.status.toUpperCase()}
        </span>
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {stepRuns.map((sr: any) => {
          const isPaused = sr.status === 'paused';
          const isFailed = sr.status === 'failed';
          const isCompleted = sr.status === 'completed';

          return (
            <div key={sr.id} style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '4px', borderLeft: `4px solid ${isFailed ? 'red' : isCompleted ? 'green' : isPaused ? 'orange' : '#3b82f6'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontWeight: '600' }}>
                  {isCompleted ? '✓' : isFailed ? '❌' : isPaused ? '⏸' : '○'} {sr.workflow_step.name}
                  <span style={{ color: '#6b7280', fontSize: '0.875rem', marginLeft: '0.5rem' }}>({sr.workflow_step.type})</span>
                </h3>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {sr.status}
                </span>
              </div>

              {isFailed && sr.error && (
                <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '4px', fontSize: '0.875rem' }}>
                  Error: {typeof sr.error === 'string' ? sr.error : JSON.stringify(sr.error)}
                </div>
              )}

              {isPaused && (
                <div style={{ marginTop: '1rem' }}>
                  <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Waiting for manual approval</p>
                  {canApprove ? (
                    <button
                      onClick={() => handleApprove(sr.id)}
                      style={{ backgroundColor: '#10b981', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                    >
                      Approve
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>(You do not have permission to approve)</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
