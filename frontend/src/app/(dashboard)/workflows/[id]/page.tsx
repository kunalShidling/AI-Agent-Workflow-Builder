'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useEffect, useState } from 'react';

import { GET_WORKFLOW } from '@/graphql/queries';
import {
  TRIGGER_WORKFLOW_RUN,
  UPDATE_WORKFLOW_STEP,
  CREATE_STEP,
  APPROVE_STEP,
} from '@/graphql/mutations';

import { useOrg } from '@/components/OrgProvider';
import { ExecutionTimeline } from '@/components/ExecutionTimeline';

/* -------------------------------------------------------------------------- */
/* Extra mutations used by the builder                                       */
/* -------------------------------------------------------------------------- */

const DELETE_STEP = gql`
  mutation DeleteWorkflowStep($id: uuid!) {
    delete_workflow_steps_by_pk(id: $id) {
      id
    }
  }
`;

const UPDATE_STEP_ORDER = gql`
  mutation UpdateWorkflowStepOrder($id: uuid!, $stepOrder: Int!) {
    update_workflow_steps_by_pk(
      pk_columns: { id: $id }
      _set: { step_order: $stepOrder }
    ) {
      id
      step_order
    }
  }
`;

const GET_PAUSED_STEP = gql`
  query GetPausedStep($workflowRunId: uuid!) {
    step_runs(
      where: {
        workflow_run_id: { _eq: $workflowRunId }
        status: { _eq: "paused" }
      }
      limit: 1
    ) {
      id
      status
      input
      output
    }
  }
`;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const STEP_LABELS: Record<string, string> = {
  llm_call: 'LLM Call',
  http_request: 'HTTP Request',
  conditional_branch: 'Conditional Branch',
  approval_gate: 'Approval Gate',
  db_write: 'Database Write',
  notify: 'Notification',
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  llm_call: 'Send a prompt to the configured LLM provider.',
  http_request: 'Make an HTTP request to an external API.',
  conditional_branch: 'Evaluate the previous step output.',
  approval_gate: 'Pause the workflow until an authorized user approves it.',
  db_write: 'Save workflow output to workflow_outputs.',
  notify: 'Create a notification event simulation.',
};

function prettyJson(value: any): string {
  if (value === undefined || value === null) return '';

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function configForStep(step: any): any {
  return step?.config || {};
}

function parseJsonObject(text: string, fieldName: string): any {
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${fieldName} must contain valid JSON.`);
  }
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function WorkflowBuilderPage() {
  const params = useParams();
  const id = params?.id as string;

  const { role, organization } = useOrg();

  const {
    data,
    loading,
    error,
    refetch,
  } = useQuery(GET_WORKFLOW, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'network-only',
  });

  const [triggerRun, { loading: running }] = useMutation(
    TRIGGER_WORKFLOW_RUN
  );

  const [updateStep, { loading: saving }] = useMutation(
    UPDATE_WORKFLOW_STEP
  );

  const [createStep, { loading: creating }] = useMutation(CREATE_STEP);

  const [deleteStep] = useMutation(DELETE_STEP);

  const [updateStepOrder] = useMutation(UPDATE_STEP_ORDER);

  const [approveStep, { loading: approving }] = useMutation(APPROVE_STEP);

  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const [pausedStepId, setPausedStepId] = useState<string | null>(null);

  const [editingStepId, setEditingStepId] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<string, any>>({});

  const [message, setMessage] = useState<string>('');

  const [errorMessage, setErrorMessage] = useState<string>('');

  const canEdit = role === 'owner' || role === 'editor';
  const isOwner = role === 'owner';

  /* ---------------------------------------------------------------------- */
  /* Detect paused step                                                     */
  /* ---------------------------------------------------------------------- */

  const {
    data: pausedData,
    refetch: refetchPausedStep,
  } = useQuery(GET_PAUSED_STEP, {
    variables: {
      workflowRunId: activeRunId,
    },
    skip: !activeRunId,
    pollInterval: activeRunId ? 2000 : 0,
    fetchPolicy: 'network-only',
  });

  useEffect(() => {
    const paused = pausedData?.step_runs?.[0];

    if (paused?.id) {
      setPausedStepId(paused.id);
    } else {
      setPausedStepId(null);
    }
  }, [pausedData]);

  /* ---------------------------------------------------------------------- */
  /* Initialize draft                                                       */
  /* ---------------------------------------------------------------------- */

  const startEditing = (step: any) => {
    setErrorMessage('');
    setMessage('');

    setEditingStepId(step.id);

    setDrafts((current) => ({
      ...current,
      [step.id]: {
        name: step.name || '',
        config: configForStep(step),
      },
    }));
  };

  const updateDraftConfig = (
    stepId: string,
    field: string,
    value: any
  ) => {
    setDrafts((current) => ({
      ...current,
      [stepId]: {
        ...current[stepId],
        config: {
          ...(current[stepId]?.config || {}),
          [field]: value,
        },
      },
    }));
  };

  const updateDraftName = (stepId: string, value: string) => {
    setDrafts((current) => ({
      ...current,
      [stepId]: {
        ...current[stepId],
        name: value,
      },
    }));
  };

  /* ---------------------------------------------------------------------- */
  /* Save step                                                              */
  /* ---------------------------------------------------------------------- */

  const handleSaveStep = async (step: any) => {
    const draft = drafts[step.id];

    if (!draft) return;

    try {
      setErrorMessage('');
      setMessage('');

      let config = draft.config || {};

      /*
       * Convert JSON text fields back into JSON objects.
       */
      if (step.type === 'http_request') {
        let headers = config.headers;

        if (typeof headers === 'string') {
          headers = parseJsonObject(headers, 'Headers');
        }

        config = {
          ...config,
          headers: headers || {},
        };
      }

      if (step.type === 'db_write') {
        let data = config.data;

        if (typeof data === 'string') {
          data = parseJsonObject(data, 'Database data');
        }

        config = {
          ...config,
          data,
        };
      }

      await updateStep({
        variables: {
          id: step.id,
          config,
          name: draft.name.trim() || STEP_LABELS[step.type] || step.type,
        },
      });

      setEditingStepId(null);

      setMessage(`Saved "${draft.name || step.name}".`);

      await refetch();
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to save step.');
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Add step                                                               */
  /* ---------------------------------------------------------------------- */

  const handleAddStep = async (type: string) => {
    try {
      setErrorMessage('');
      setMessage('');

      const steps = data?.workflows_by_pk?.workflow_steps || [];

      const nextOrder = steps.length + 1;

      const defaultNames: Record<string, string> = {
        llm_call: 'AI Analysis',
        http_request: 'HTTP Request',
        conditional_branch: 'Check Condition',
        approval_gate: 'Manual Approval',
        db_write: 'Save Result',
        notify: 'Notify',
      };

      const defaultConfig: Record<string, any> = {
        llm_call: {
          prompt: 'Analyze this: {{input}}',
        },

        http_request: {
          url: 'https://httpbin.org/post',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            input: '{{input}}',
          },
        },

        conditional_branch: {
          value: 'positive',
          operator: 'contains',
        },

        approval_gate: {},

        db_write: {
          data: {},
        },

        notify: {
          message: 'Workflow notification',
        },
      };

      await createStep({
        variables: {
          workflowId: id,
          type,
          name: defaultNames[type] || `New ${type}`,
          stepOrder: nextOrder,
        },
      });

      setMessage(`${STEP_LABELS[type] || type} step added.`);

      await refetch();
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to create step.');
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Delete step                                                            */
  /* ---------------------------------------------------------------------- */

  const handleDeleteStep = async (step: any) => {
    const confirmed = window.confirm(
      `Delete "${step.name}"?\n\nThis cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setErrorMessage('');
      setMessage('');

      await deleteStep({
        variables: {
          id: step.id,
        },
      });

      setEditingStepId(null);

      setMessage(`Deleted "${step.name}".`);

      await refetch();
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to delete step.');
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Move step                                                              */
  /* ---------------------------------------------------------------------- */

  const handleMoveStep = async (
    step: any,
    direction: 'up' | 'down'
  ) => {
    const steps = [...(data?.workflows_by_pk?.workflow_steps || [])].sort(
      (a: any, b: any) => a.step_order - b.step_order
    );

    const index = steps.findIndex((item: any) => item.id === step.id);

    if (index === -1) return;

    const targetIndex =
      direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= steps.length) {
      return;
    }

    const target = steps[targetIndex];

    try {
      setErrorMessage('');
      setMessage('');

      /*
       * Swap the step_order values.
       *
       * Temporary value prevents a collision if step_order has a
       * uniqueness constraint.
       */
      await updateStepOrder({
        variables: {
          id: step.id,
          stepOrder: 999999,
        },
      });

      await updateStepOrder({
        variables: {
          id: target.id,
          stepOrder: step.step_order,
        },
      });

      await updateStepOrder({
        variables: {
          id: step.id,
          stepOrder: target.step_order,
        },
      });

      await refetch();

      setMessage('Step order updated.');
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to reorder steps.');

      /*
       * Try to reload the server state after an unsuccessful reorder.
       */
      await refetch();
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Run workflow                                                           */
  /* ---------------------------------------------------------------------- */

  const handleRun = async () => {
    try {
      setErrorMessage('');
      setMessage('');

      if (!organization) {
        throw new Error('No organization selected.');
      }

      if (
        organization.calls_used >= organization.calls_allowed
      ) {
        throw new Error(
          'Organization quota exhausted. Workflows cannot be executed.'
        );
      }

      const steps = data?.workflows_by_pk?.workflow_steps || [];

      if (steps.length === 0) {
        throw new Error(
          'Add at least one workflow step before running.'
        );
      }

      const res = await triggerRun({
        variables: {
          workflowId: id,
        },
      });

      const runId =
        res?.data?.triggerWorkflowRun?.workflow_run_id;

      if (!runId) {
        throw new Error('Workflow started but no run ID was returned.');
      }

      setActiveRunId(runId);

      setMessage('Workflow execution started.');
    } catch (e: any) {
      setErrorMessage(
        'Failed to trigger workflow: ' +
          (e?.message || 'Unknown error')
      );
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Approve paused step                                                    */
  /* ---------------------------------------------------------------------- */

  const handleApprove = async () => {
    if (!pausedStepId) return;

    try {
      setErrorMessage('');
      setMessage('');

      await approveStep({
        variables: {
          stepRunId: pausedStepId,
        },
      });

      setPausedStepId(null);

      setMessage('Approval submitted. Workflow is resuming.');

      await refetchPausedStep();
    } catch (e: any) {
      setErrorMessage(
        'Approval failed: ' +
          (e?.message || 'Unknown error')
      );
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Loading / error                                                         */
  /* ---------------------------------------------------------------------- */

  if (loading) {
    return (
      <div style={styles.centerPage}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner}>⏳</div>
          <h2>Loading workflow...</h2>
          <p style={styles.muted}>
            Fetching workflow configuration from Hasura.
          </p>
        </div>
      </div>
    );
  }

  if (error || !data?.workflows_by_pk) {
    return (
      <div style={styles.centerPage}>
        <div style={styles.errorCard}>
          <h2>Workflow not found</h2>

          <p>
            The workflow may not exist, or your organization
            permissions may prevent access.
          </p>

          {error?.message && (
            <pre style={styles.errorPre}>
              {error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Workflow data                                                           */
  /* ---------------------------------------------------------------------- */

  const wf = data.workflows_by_pk;

  const steps = [...(wf.workflow_steps || [])].sort(
    (a: any, b: any) => a.step_order - b.step_order
  );

  const triggers = wf.workflow_triggers || [];

  const webhookTrigger = triggers.find(
    (trigger: any) =>
      trigger.trigger_type === 'webhook'
  );

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <div style={styles.page}>
      {/* ---------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ---------------------------------------------------------------- */}

      <div style={styles.header}>
        <div>
          <div style={styles.breadcrumb}>
            Workflows / Builder
          </div>

          <h1 style={styles.title}>{wf.name}</h1>

          <p style={styles.description}>
            {wf.description || 'No workflow description.'}
          </p>

          <div style={styles.roleRow}>
            <span style={styles.roleBadge}>
              {String(role || 'viewer').toUpperCase()}
            </span>

            <span style={styles.stepCount}>
              {steps.length} step{steps.length === 1 ? '' : 's'}
            </span>

            {organization && (
              <span style={styles.quotaBadge}>
                Quota: {organization.calls_used}/
                {organization.calls_allowed}
              </span>
            )}
          </div>
        </div>

        <div style={styles.headerActions}>
          {canEdit && (
            <button
              onClick={handleRun}
              disabled={running}
              style={{
                ...styles.runButton,
                opacity: running ? 0.6 : 1,
              }}
            >
              {running ? 'Starting...' : '▶ Run Workflow'}
            </button>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Messages                                                          */}
      {/* ---------------------------------------------------------------- */}

      {message && (
        <div style={styles.successMessage}>
          ✓ {message}
        </div>
      )}

      {errorMessage && (
        <div style={styles.errorMessage}>
          <strong>Error:</strong> {errorMessage}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Workflow steps                                                    */}
      {/* ---------------------------------------------------------------- */}

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>
              Workflow Steps
            </h2>

            <p style={styles.sectionDescription}>
              Configure the steps executed in order.
            </p>
          </div>
        </div>

        {steps.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>⚙️</div>

            <h3>No steps yet</h3>

            <p>
              Add an LLM, HTTP, conditional, approval,
              database, or notification step below.
            </p>
          </div>
        )}

        <div style={styles.stepsContainer}>
          {steps.map((step: any, index: number) => {
            const editing = editingStepId === step.id;

            const draft = drafts[step.id];

            const config = editing
              ? draft?.config || {}
              : step.config || {};

            /*
             * Editors cannot configure db_write or notify.
             * The backend also enforces this restriction.
             */
            const restrictedForEditor =
              role === 'editor' &&
              (step.type === 'db_write' ||
                step.type === 'notify');

            const canConfigure =
              canEdit && !restrictedForEditor;

            return (
              <div key={step.id}>
                {/* Step card */}
                <div
                  style={{
                    ...styles.stepCard,
                    borderColor: editing
                      ? '#2563eb'
                      : '#e5e7eb',
                  }}
                >
                  {/* Step header */}
                  <div style={styles.stepHeader}>
                    <div style={styles.stepTitleArea}>
                      <div style={styles.stepNumber}>
                        {index + 1}
                      </div>

                      <div>
                        <h3 style={styles.stepName}>
                          {step.name}
                        </h3>

                        <div style={styles.stepType}>
                          {STEP_LABELS[step.type] ||
                            step.type}
                        </div>
                      </div>
                    </div>

                    <div style={styles.stepActions}>
                      {canEdit && (
                        <>
                          <button
                            onClick={() =>
                              handleMoveStep(step, 'up')
                            }
                            disabled={index === 0}
                            style={styles.smallButton}
                            title="Move up"
                          >
                            ↑
                          </button>

                          <button
                            onClick={() =>
                              handleMoveStep(step, 'down')
                            }
                            disabled={
                              index === steps.length - 1
                            }
                            style={styles.smallButton}
                            title="Move down"
                          >
                            ↓
                          </button>
                        </>
                      )}

                      {canConfigure && (
                        <button
                          onClick={() =>
                            editing
                              ? setEditingStepId(null)
                              : startEditing(step)
                          }
                          style={styles.editButton}
                        >
                          {editing ? 'Close' : 'Configure'}
                        </button>
                      )}

                      {canEdit && (
                        <button
                          onClick={() =>
                            handleDeleteStep(step)
                          }
                          style={styles.deleteButton}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p style={styles.stepDescription}>
                    {STEP_DESCRIPTIONS[step.type] ||
                      'Workflow step.'}
                  </p>

                  {/* Editor */}
                  {editing && canConfigure && (
                    <div style={styles.editor}>
                      {/* Name */}
                      <label style={styles.label}>
                        Step Name
                      </label>

                      <input
                        value={draft?.name || ''}
                        onChange={(e) =>
                          updateDraftName(
                            step.id,
                            e.target.value
                          )
                        }
                        style={styles.input}
                        placeholder="Step name"
                      />

                      {/* ------------------------------------------------ */}
                      {/* LLM CALL                                         */}
                      {/* ------------------------------------------------ */}

                      {step.type === 'llm_call' && (
                        <>
                          <label style={styles.label}>
                            Prompt
                          </label>

                          <textarea
                            value={config.prompt || ''}
                            onChange={(e) =>
                              updateDraftConfig(
                                step.id,
                                'prompt',
                                e.target.value
                              )
                            }
                            rows={6}
                            style={styles.textarea}
                            placeholder="Analyze this: {{input}}"
                          />

                          <p style={styles.helpText}>
                            Use <code>{'{{input}}'}</code> to
                            reference the previous step's
                            output.
                          </p>
                        </>
                      )}

                      {/* ------------------------------------------------ */}
                      {/* HTTP REQUEST                                     */}
                      {/* ------------------------------------------------ */}

                      {step.type === 'http_request' && (
                        <>
                          <label style={styles.label}>
                            URL
                          </label>

                          <input
                            value={config.url || ''}
                            onChange={(e) =>
                              updateDraftConfig(
                                step.id,
                                'url',
                                e.target.value
                              )
                            }
                            style={styles.input}
                            placeholder="https://httpbin.org/post"
                          />

                          <label style={styles.label}>
                            Method
                          </label>

                          <select
                            value={
                              config.method || 'GET'
                            }
                            onChange={(e) =>
                              updateDraftConfig(
                                step.id,
                                'method',
                                e.target.value
                              )
                            }
                            style={styles.input}
                          >
                            <option value="GET">
                              GET
                            </option>
                            <option value="POST">
                              POST
                            </option>
                            <option value="PUT">
                              PUT
                            </option>
                            <option value="PATCH">
                              PATCH
                            </option>
                            <option value="DELETE">
                              DELETE
                            </option>
                          </select>

                          <label style={styles.label}>
                            Headers JSON
                          </label>

                          <textarea
                            value={prettyJson(
                              config.headers || {}
                            )}
                            onChange={(e) =>
                              updateDraftConfig(
                                step.id,
                                'headers',
                                e.target.value
                              )
                            }
                            rows={5}
                            style={styles.codeTextarea}
                            placeholder={`{
  "Content-Type": "application/json"
}`}
                          />

                          <label style={styles.label}>
                            Body JSON / Text
                          </label>

                          <textarea
                            value={
                              typeof config.body ===
                              'string'
                                ? config.body
                                : prettyJson(
                                    config.body || {}
                                  )
                            }
                            onChange={(e) =>
                              updateDraftConfig(
                                step.id,
                                'body',
                                e.target.value
                              )
                            }
                            rows={7}
                            style={styles.codeTextarea}
                            placeholder={`{
  "input": "{{input}}"
}`}
                          />

                          <p style={styles.helpText}>
                            Redirects and private/internal
                            IP addresses are blocked by the
                            backend SSRF protection.
                          </p>
                        </>
                      )}

                      {/* ------------------------------------------------ */}
                      {/* CONDITIONAL                                      */}
                      {/* ------------------------------------------------ */}

                      {step.type ===
                        'conditional_branch' && (
                        <>
                          <label style={styles.label}>
                            Operator
                          </label>

                          <select
                            value={
                              config.operator ||
                              'contains'
                            }
                            onChange={(e) =>
                              updateDraftConfig(
                                step.id,
                                'operator',
                                e.target.value
                              )
                            }
                            style={styles.input}
                          >
                            <option value="contains">
                              Contains
                            </option>

                            <option value="equals">
                              Equals
                            </option>

                            <option value="not_equals">
                              Not Equals
                            </option>
                          </select>

                          <label style={styles.label}>
                            Comparison Value
                          </label>

                          <input
                            value={config.value || ''}
                            onChange={(e) =>
                              updateDraftConfig(
                                step.id,
                                'value',
                                e.target.value
                              )
                            }
                            style={styles.input}
                            placeholder="positive"
                          />

                          <div style={styles.infoBox}>
                            The backend compares{' '}
                            <code>{'{{input}}'}</code> from
                            the execution context with this
                            value.
                          </div>
                        </>
                      )}

                      {/* ------------------------------------------------ */}
                      {/* APPROVAL                                         */}
                      {/* ------------------------------------------------ */}

                      {step.type === 'approval_gate' && (
                        <div style={styles.infoBox}>
                          <strong>Manual Approval</strong>

                          <p style={{ margin: '0.5rem 0 0' }}>
                            No configuration is required.
                            When execution reaches this step,
                            the workflow pauses until an
                            authorized owner or editor approves
                            it.
                          </p>
                        </div>
                      )}

                      {/* ------------------------------------------------ */}
                      {/* DB WRITE                                          */}
                      {/* ------------------------------------------------ */}

                      {step.type === 'db_write' && (
                        <>
                          <label style={styles.label}>
                            Data JSON
                          </label>

                          <textarea
                            value={
                              typeof config.data ===
                              'string'
                                ? config.data
                                : prettyJson(
                                    config.data || {}
                                  )
                            }
                            onChange={(e) =>
                              updateDraftConfig(
                                step.id,
                                'data',
                                e.target.value
                              )
                            }
                            rows={8}
                            style={styles.codeTextarea}
                            placeholder={`{
  "result": "{{input}}"
}`}
                          />

                          <p style={styles.helpText}>
                            This step writes to the
                            <code>workflow_outputs</code>{' '}
                            table. It does not execute
                            arbitrary SQL.
                          </p>
                        </>
                      )}

                      {/* ------------------------------------------------ */}
                      {/* NOTIFY                                            */}
                      {/* ------------------------------------------------ */}

                      {step.type === 'notify' && (
                        <>
                          <label style={styles.label}>
                            Notification Message
                          </label>

                          <textarea
                            value={config.message || ''}
                            onChange={(e) =>
                              updateDraftConfig(
                                step.id,
                                'message',
                                e.target.value
                              )
                            }
                            rows={5}
                            style={styles.textarea}
                            placeholder="Workflow notification"
                          />

                          <p style={styles.helpText}>
                            The current backend simulates the
                            notification through its Event
                            Trigger architecture.
                          </p>
                        </>
                      )}

                      {/* Save */}
                      <div style={styles.editorFooter}>
                        <button
                          onClick={() =>
                            handleSaveStep(step)
                          }
                          disabled={saving}
                          style={styles.saveButton}
                        >
                          {saving
                            ? 'Saving...'
                            : 'Save Configuration'}
                        </button>

                        <button
                          onClick={() =>
                            setEditingStepId(null)
                          }
                          style={styles.cancelButton}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Editor restriction */}
                  {restrictedForEditor && (
                    <div style={styles.warningBox}>
                      🔒 This step is owner-only. Editors
                      cannot modify <code>{step.type}</code>{' '}
                      configuration.
                    </div>
                  )}

                  {/* Configuration preview */}
                  {!editing && (
                    <div style={styles.preview}>
                      <span style={styles.previewLabel}>
                        Configuration
                      </span>

                      <pre style={styles.previewCode}>
                        {prettyJson(step.config || {})}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Connector */}
                {index < steps.length - 1 && (
                  <div style={styles.connector}>
                    <div style={styles.connectorLine} />
                    <span style={styles.connectorArrow}>
                      ↓
                    </span>
                    <div style={styles.connectorLine} />
                  </div>
                )}
              </div>
            );
            })}
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Add buttons                                                     */}
        {/* -------------------------------------------------------------- */}

        {canEdit && (
          <div style={styles.addSection}>
            <h3 style={styles.addTitle}>
              Add Workflow Step
            </h3>

            <div style={styles.addButtons}>
              <button
                onClick={() => handleAddStep('llm_call')}
                style={styles.addButton}
              >
                🤖 LLM Call
              </button>

              <button
                onClick={() =>
                  handleAddStep('http_request')
                }
                style={styles.addButton}
              >
                🌐 HTTP Request
              </button>

              <button
                onClick={() =>
                  handleAddStep('conditional_branch')
                }
                style={styles.addButton}
              >
                🔀 Conditional
              </button>

              <button
                onClick={() =>
                  handleAddStep('approval_gate')
                }
                style={styles.addButton}
              >
                ✋ Approval Gate
              </button>

              {isOwner && (
                <>
                  <button
                    onClick={() =>
                      handleAddStep('db_write')
                    }
                    style={styles.ownerAddButton}
                  >
                    💾 DB Write
                  </button>

                  <button
                    onClick={() =>
                      handleAddStep('notify')
                    }
                    style={styles.ownerAddButton}
                  >
                    🔔 Notify
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Trigger configuration                                             */}
      {/* ---------------------------------------------------------------- */}

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>
              Workflow Triggers
            </h2>

            <p style={styles.sectionDescription}>
              Triggers determine how this workflow can start.
            </p>
          </div>
        </div>

        <div style={styles.triggerGrid}>
          <div style={styles.triggerCard}>
            <div style={styles.triggerIcon}>▶</div>

            <div>
              <strong>Manual</strong>

              <p style={styles.triggerText}>
                Start the workflow using the Run Workflow
                button.
              </p>

              <span style={styles.enabledBadge}>
                Available
              </span>
            </div>
          </div>

          <div style={styles.triggerCard}>
            <div style={styles.triggerIcon}>🔗</div>

            <div>
              <strong>Webhook</strong>

              <p style={styles.triggerText}>
                Receive an HTTP request and start the
                workflow.
              </p>

              {webhookTrigger ? (
                <span style={styles.enabledBadge}>
                  ✓ Configured
                </span>
              ) : (
                <span style={styles.disabledBadge}>
                  Not configured
                </span>
              )}
            </div>
          </div>

          <div style={styles.triggerCard}>
            <div style={styles.triggerIcon}>⏰</div>

            <div>
              <strong>Scheduled</strong>

              <p style={styles.triggerText}>
                Start automatically through the scheduler.
              </p>

              <span style={styles.infoBadge}>
                Backend supported
              </span>
            </div>
          </div>

          <div style={styles.triggerCard}>
            <div style={styles.triggerIcon}>⚡</div>

            <div>
              <strong>Database Event</strong>

              <p style={styles.triggerText}>
                Start from a Hasura database event.
              </p>

              <span style={styles.infoBadge}>
                Backend supported
              </span>
            </div>
          </div>
        </div>

        {isOwner && !webhookTrigger && (
          <div style={styles.infoBox}>
            <strong>Webhook setup</strong>

            <p style={{ margin: '0.4rem 0 0' }}>
              The webhook backend function is deployed and
              protected by the configured webhook secret.
              Create the webhook trigger through your
              Hasura/Nhost trigger configuration.
            </p>
          </div>
        )}

        {!isOwner && (
          <div style={styles.infoBox}>
            Webhook configuration is restricted to the
            organization owner.
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Approval panel                                                    */}
      {/* ---------------------------------------------------------------- */}

      {activeRunId && pausedStepId && (
        <section style={styles.approvalCard}>
          <div style={styles.approvalIcon}>✋</div>

          <div style={{ flex: 1 }}>
            <h2 style={styles.approvalTitle}>
              Workflow Waiting for Approval
            </h2>

            <p style={styles.approvalText}>
              An approval gate has paused this workflow.
              An organization owner or editor can approve
              the paused step.
            </p>

            <code style={styles.runCode}>
              Run: {activeRunId}
            </code>
          </div>

          {canEdit && (
            <button
              onClick={handleApprove}
              disabled={approving}
              style={styles.approveButton}
            >
              {approving
                ? 'Approving...'
                : '✓ Approve & Continue'}
            </button>
          )}
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Live execution                                                    */}
      {/* ---------------------------------------------------------------- */}

      {activeRunId && (
        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>
                Live Execution
              </h2>

              <p style={styles.sectionDescription}>
                Run status is streamed from the workflow
                execution state.
              </p>
            </div>
          </div>

          <ExecutionTimeline workflowRunId={activeRunId} />
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Viewer information                                                */}
      {/* ---------------------------------------------------------------- */}

      {!canEdit && (
        <div style={styles.viewerNotice}>
          👁️ You have <strong>viewer</strong> access to this
          workflow. Configuration changes and workflow
          execution are disabled.
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Styles                                                                     */
/* ========================================================================== */

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
    backgroundColor: '#f8fafc',
  },

  centerPage: {
    minHeight: '70vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
  },

  loadingCard: {
    textAlign: 'center',
    padding: '3rem',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
  },

  spinner: {
    fontSize: '2rem',
    marginBottom: '1rem',
  },

  errorCard: {
    maxWidth: '650px',
    width: '100%',
    padding: '2rem',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    color: '#991b1b',
  },

  errorPre: {
    marginTop: '1rem',
    padding: '1rem',
    backgroundColor: '#fef2f2',
    borderRadius: '6px',
    whiteSpace: 'pre-wrap',
    fontSize: '0.8rem',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '2rem',
    marginBottom: '1.5rem',
  },

  breadcrumb: {
    color: '#64748b',
    fontSize: '0.85rem',
    marginBottom: '0.5rem',
  },

  title: {
    margin: 0,
    fontSize: '2rem',
    fontWeight: 800,
    color: '#0f172a',
  },

  description: {
    color: '#64748b',
    marginTop: '0.5rem',
    marginBottom: '0.75rem',
  },

  roleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },

  roleBadge: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    padding: '0.25rem 0.6rem',
    borderRadius: '999px',
    fontSize: '0.72rem',
    fontWeight: 700,
  },

  stepCount: {
    color: '#64748b',
    fontSize: '0.8rem',
  },

  quotaBadge: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    padding: '0.25rem 0.6rem',
    borderRadius: '999px',
    fontSize: '0.72rem',
  },

  headerActions: {
    display: 'flex',
    gap: '0.75rem',
  },

  runButton: {
    backgroundColor: '#059669',
    color: 'white',
    border: 'none',
    padding: '0.75rem 1.25rem',
    borderRadius: '8px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
  },

  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
    border: '1px solid #e2e8f0',
  },

  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },

  sectionTitle: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 750,
    color: '#0f172a',
  },

  sectionDescription: {
    margin: '0.3rem 0 0',
    color: '#64748b',
    fontSize: '0.9rem',
  },

  successMessage: {
    backgroundColor: '#ecfdf5',
    color: '#047857',
    border: '1px solid #a7f3d0',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    marginBottom: '1rem',
  },

  errorMessage: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    marginBottom: '1rem',
  },

  stepsContainer: {
    display: 'flex',
    flexDirection: 'column',
  },

  stepCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '1rem',
    transition: 'border-color 0.2s ease',
  },

  stepHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
  },

  stepTitleArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },

  stepNumber: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
  },

  stepName: {
    margin: 0,
    color: '#0f172a',
    fontSize: '1rem',
  },

  stepType: {
    marginTop: '0.2rem',
    color: '#2563eb',
    fontSize: '0.75rem',
    fontWeight: 600,
  },

  stepActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    flexWrap: 'wrap',
  },

  smallButton: {
    backgroundColor: '#f1f5f9',
    color: '#334155',
    border: '1px solid #cbd5e1',
    borderRadius: '5px',
    padding: '0.35rem 0.6rem',
    cursor: 'pointer',
    fontWeight: 700,
  },

  editButton: {
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    border: '1px solid #bfdbfe',
    borderRadius: '6px',
    padding: '0.4rem 0.7rem',
    cursor: 'pointer',
    fontWeight: 600,
  },

  deleteButton: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '0.4rem 0.7rem',
    cursor: 'pointer',
    fontWeight: 600,
  },

  stepDescription: {
    margin: '0.75rem 0',
    color: '#64748b',
    fontSize: '0.85rem',
  },

  preview: {
    marginTop: '1rem',
    backgroundColor: '#f8fafc',
    borderRadius: '7px',
    padding: '0.75rem',
  },

  previewLabel: {
    display: 'block',
    color: '#64748b',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: '0.4rem',
  },

  previewCode: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowX: 'auto',
    color: '#334155',
    fontSize: '0.78rem',
    fontFamily: 'monospace',
  },

  connector: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '42px',
    gap: '0.5rem',
  },

  connectorLine: {
    width: '1px',
    height: '14px',
    backgroundColor: '#cbd5e1',
  },

  connectorArrow: {
    color: '#64748b',
    fontWeight: 700,
  },

  editor: {
    marginTop: '1rem',
    padding: '1rem',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },

  label: {
    display: 'block',
    marginTop: '0.85rem',
    marginBottom: '0.35rem',
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#334155',
  },

  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    padding: '0.65rem',
    fontSize: '0.9rem',
    backgroundColor: 'white',
  },

  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    padding: '0.65rem',
    fontSize: '0.9rem',
    resize: 'vertical',
    fontFamily: 'inherit',
    backgroundColor: 'white',
  },

  codeTextarea: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    padding: '0.65rem',
    fontSize: '0.82rem',
    resize: 'vertical',
    fontFamily: 'monospace',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
  },

  helpText: {
    margin: '0.4rem 0 0',
    color: '#64748b',
    fontSize: '0.75rem',
  },

  infoBox: {
    marginTop: '1rem',
    padding: '0.8rem',
    borderRadius: '7px',
    backgroundColor: '#eff6ff',
    color: '#1e40af',
    border: '1px solid #bfdbfe',
    fontSize: '0.82rem',
  },

  warningBox: {
    marginTop: '0.75rem',
    padding: '0.7rem',
    borderRadius: '7px',
    backgroundColor: '#fff7ed',
    color: '#9a3412',
    border: '1px solid #fed7aa',
    fontSize: '0.8rem',
  },

  editorFooter: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '1rem',
  },

  saveButton: {
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '0.65rem 1rem',
    cursor: 'pointer',
    fontWeight: 700,
  },

  cancelButton: {
    backgroundColor: '#f1f5f9',
    color: '#334155',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    padding: '0.65rem 1rem',
    cursor: 'pointer',
  },

  addSection: {
    marginTop: '1.5rem',
    paddingTop: '1.25rem',
    borderTop: '1px solid #e2e8f0',
  },

  addTitle: {
    margin: '0 0 0.75rem',
    fontSize: '0.95rem',
    color: '#334155',
  },

  addButtons: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },

  addButton: {
    backgroundColor: '#f1f5f9',
    color: '#334155',
    border: '1px solid #cbd5e1',
    borderRadius: '7px',
    padding: '0.6rem 0.8rem',
    cursor: 'pointer',
    fontWeight: 600,
  },

  ownerAddButton: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fecaca',
    borderRadius: '7px',
    padding: '0.6rem 0.8rem',
    cursor: 'pointer',
    fontWeight: 600,
  },

  emptyState: {
    textAlign: 'center',
    padding: '2.5rem 1rem',
    border: '2px dashed #cbd5e1',
    borderRadius: '10px',
    color: '#64748b',
    marginBottom: '1rem',
  },

  emptyIcon: {
    fontSize: '2rem',
    marginBottom: '0.5rem',
  },

  triggerGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '0.75rem',
    marginBottom: '1rem',
  },

  triggerCard: {
    display: 'flex',
    gap: '0.75rem',
    padding: '1rem',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#f8fafc',
  },

  triggerIcon: {
    fontSize: '1.4rem',
  },

  triggerText: {
    color: '#64748b',
    fontSize: '0.78rem',
    lineHeight: 1.4,
    margin: '0.3rem 0 0.6rem',
  },

  enabledBadge: {
    display: 'inline-block',
    backgroundColor: '#dcfce7',
    color: '#166534',
    borderRadius: '999px',
    padding: '0.2rem 0.5rem',
    fontSize: '0.68rem',
    fontWeight: 700,
  },

  disabledBadge: {
    display: 'inline-block',
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    borderRadius: '999px',
    padding: '0.2rem 0.5rem',
    fontSize: '0.68rem',
  },

  infoBadge: {
    display: 'inline-block',
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    borderRadius: '999px',
    padding: '0.2rem 0.5rem',
    fontSize: '0.68rem',
    fontWeight: 600,
  },

  approvalCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    backgroundColor: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: '12px',
    padding: '1.25rem',
    marginBottom: '1.5rem',
  },

  approvalIcon: {
    fontSize: '2rem',
  },

  approvalTitle: {
    margin: 0,
    color: '#92400e',
    fontSize: '1.05rem',
  },

  approvalText: {
    color: '#78350f',
    fontSize: '0.85rem',
    margin: '0.35rem 0',
  },

  runCode: {
    color: '#92400e',
    fontSize: '0.72rem',
  },

  approveButton: {
    backgroundColor: '#d97706',
    color: 'white',
    border: 'none',
    borderRadius: '7px',
    padding: '0.7rem 1rem',
    cursor: 'pointer',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },

  viewerNotice: {
    backgroundColor: '#f1f5f9',
    border: '1px solid #cbd5e1',
    color: '#475569',
    padding: '1rem',
    borderRadius: '8px',
    marginBottom: '2rem',
  },

  muted: {
    color: '#64748b',
  },
};