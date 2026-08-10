import { query } from '../utils/db';

export async function createWorkflowRun(workflowId: string, triggerType: string, userId: string) {
  const res = await query(`
    INSERT INTO workflow_runs (workflow_id, trigger_type, status, started_at, created_by)
    VALUES ($1, $2, 'running', NOW(), $3)
    RETURNING id
  `, [workflowId, triggerType, userId]);
  return res.rows[0].id;
}

export async function createStepRun(workflowRunId: string, stepId: string) {
  const res = await query(`
    INSERT INTO step_runs (workflow_run_id, workflow_step_id, status, started_at)
    VALUES ($1, $2, 'running', NOW())
    RETURNING id
  `, [workflowRunId, stepId]);
  return res.rows[0].id;
}

export async function updateStepRun(stepRunId: string, status: string, output: any = null, error: any = null, incrementAttempt: boolean = false) {
  // We use string concatenation for attempt_count increment because parameterized queries for expressions are tricky, 
  // but we hardcode the expression so it's SQL injection safe.
  const attemptInc = incrementAttempt ? 'attempt_count + 1' : 'attempt_count';
  
  await query(`
    UPDATE step_runs
    SET status = $2, 
        output = $3, 
        error = $4, 
        attempt_count = ${attemptInc}, 
        completed_at = CASE WHEN $2 IN ('completed', 'failed', 'skipped') THEN NOW() ELSE completed_at END
    WHERE id = $1
  `, [stepRunId, status, output ? JSON.stringify(output) : null, error ? JSON.stringify(error) : null]);
}

export async function updateWorkflowRun(workflowRunId: string, status: string, error: any = null) {
  await query(`
    UPDATE workflow_runs
    SET status = $2, error = $3, 
        completed_at = CASE WHEN $2 IN ('completed', 'failed', 'cancelled') THEN NOW() ELSE completed_at END,
        paused_at = CASE WHEN $2 = 'paused' THEN NOW() ELSE paused_at END
    WHERE id = $1
  `, [workflowRunId, status, error ? JSON.stringify(error) : null]);
}
