'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@apollo/client';
import { GET_WORKFLOW } from '@/graphql/queries';
import { TRIGGER_WORKFLOW_RUN, UPDATE_WORKFLOW_STEP, CREATE_STEP } from '@/graphql/mutations';
import { useOrg } from '@/components/OrgProvider';
import { ExecutionTimeline } from '@/components/ExecutionTimeline';
import { useState } from 'react';

export default function WorkflowBuilderPage() {
  const params = useParams();
  const id = params?.id as string;
  const { role, organization } = useOrg();

  const { data, loading, error, refetch } = useQuery(GET_WORKFLOW, { variables: { id }, skip: !id });
  const [triggerRun, { loading: running }] = useMutation(TRIGGER_WORKFLOW_RUN);
  const [updateStep] = useMutation(UPDATE_WORKFLOW_STEP);
  const [createStep] = useMutation(CREATE_STEP, { onCompleted: () => refetch() });

  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  if (loading) return <div style={{ padding: '2rem' }}>Loading workflow...</div>;
  if (error || !data?.workflows_by_pk) return <div style={{ padding: '2rem', color: 'red' }}>Workflow not found or access denied.</div>;

  const wf = data.workflows_by_pk;
  const canEdit = role === 'owner' || role === 'editor';
  const isOwner = role === 'owner';

  const handleRun = async () => {
    try {
      if (!organization || organization.calls_used >= organization.calls_allowed) {
        alert('Organization quota exhausted. Workflows cannot be executed.');
        return;
      }
      const res = await triggerRun({ variables: { workflowId: id } });
      setActiveRunId(res.data.triggerWorkflowRun.workflow_run_id);
    } catch (e: any) {
      alert('Failed to trigger run: ' + e.message);
    }
  };

  const handleAddStep = async (type: string) => {
    await createStep({ variables: {
      workflowId: id,
      type,
      name: `New ${type}`,
      stepOrder: wf.workflow_steps.length + 1
    }});
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>{wf.name}</h1>
          <p style={{ color: '#6b7280' }}>{wf.description}</p>
        </div>
        <div>
          {canEdit && (
            <button
              onClick={handleRun}
              disabled={running}
              style={{ backgroundColor: '#10b981', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
            >
              {running ? 'Starting...' : '▶ Run Workflow'}
            </button>
          )}
        </div>
      </div>

      {/* Builder */}
      <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem' }}>Workflow Steps</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {wf.workflow_steps.map((step: any, index: number) => (
            <div key={step.id} style={{ display: 'flex', flexDirection: 'column', padding: '1rem', border: '1px solid #d1d5db', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ fontWeight: '600' }}>{index + 1}. {step.name}</h3>
                <span style={{ backgroundColor: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{step.type}</span>
              </div>
              <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                {canEdit ? (
                   <div style={{ marginTop: '0.5rem', color: '#6b7280' }}>
                     Configuration hidden for brevity in this simple UI...
                   </div>
                ) : (
                   <div style={{ marginTop: '0.5rem', color: '#6b7280' }}>Read-only view</div>
                )}
              </div>
              {index < wf.workflow_steps.length - 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0' }}>
                  ↓
                </div>
              )}
            </div>
          ))}

          {canEdit && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button onClick={() => handleAddStep('llm_call')} style={{ padding: '0.5rem', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ LLM Call</button>
              <button onClick={() => handleAddStep('http_request')} style={{ padding: '0.5rem', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ HTTP Request</button>
              <button onClick={() => handleAddStep('conditional_branch')} style={{ padding: '0.5rem', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Conditional</button>
              <button onClick={() => handleAddStep('approval_gate')} style={{ padding: '0.5rem', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Approval Gate</button>

              {isOwner && (
                <>
                  <button onClick={() => handleAddStep('db_write')} style={{ padding: '0.5rem', backgroundColor: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ DB Write (Owner)</button>
                  <button onClick={() => handleAddStep('notify')} style={{ padding: '0.5rem', backgroundColor: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Notify (Owner)</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Triggers */}
      {isOwner && (
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Webhook Trigger (Owner Only)</h2>
          {wf.workflow_triggers?.find((t: any) => t.trigger_type === 'webhook') ? (
            <div>
              <p style={{ color: '#10b981', fontWeight: '600', marginBottom: '0.5rem' }}>✓ Webhook is configured and enabled.</p>
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>The secret is stored securely and cannot be retrieved. Rotate it via API if compromised.</p>
            </div>
          ) : (
            <button style={{ backgroundColor: '#3b82f6', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
              Generate Webhook Secret
            </button>
          )}
        </div>
      )}

      {/* Live Execution View */}
      {activeRunId && (
        <ExecutionTimeline workflowRunId={activeRunId} />
      )}

    </div>
  );
}
