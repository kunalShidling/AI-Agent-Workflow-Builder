import { resumeWorkflowRun } from '../executor/workflowExecutor';
import { logger } from '../utils/logger';
import { query } from '../utils/db';

export interface ActionRequest {
  session_variables: Record<string, string>;
  input: any;
}

export async function approveStepHandler(req: ActionRequest) {
  try {
    const userId = req.session_variables['x-hasura-user-id'];
    if (!userId) {
      throw new Error('Unauthenticated request: Missing x-hasura-user-id');
    }

    const { step_run_id } = req.input;
    if (!step_run_id) {
      throw new Error('Missing step_run_id');
    }

    // 1. Fetch relations and verify approval state & authorization
    const stateCheck = await query(`
      SELECT 
        sr.status as step_status,
        wr.id as workflow_run_id,
        wr.status as run_status,
        ws.type as step_type,
        ws.step_order,
        om.role
      FROM step_runs sr
      JOIN workflow_runs wr ON sr.workflow_run_id = wr.id
      JOIN workflows w ON wr.workflow_id = w.id
      JOIN workflow_steps ws ON sr.workflow_step_id = ws.id
      LEFT JOIN org_members om ON w.org_id = om.org_id AND om.user_id = $2
      WHERE sr.id = $1
    `, [step_run_id, userId]);

    if (stateCheck.rowCount === 0) {
      throw new Error('Step run not found');
    }

    const state = stateCheck.rows[0];

    // Verify User Role in Org
    if (!state.role || (state.role !== 'owner' && state.role !== 'editor')) {
      throw new Error('Unauthorized: Only owner or editor of the organization can approve');
    }

    // Verify Step is an Approval Gate
    if (state.step_type !== 'approval_gate') {
      throw new Error('Step is not an approval_gate');
    }

    // Verify state is paused
    if (state.step_status !== 'paused' || state.run_status !== 'paused') {
      throw new Error('Workflow or step is not in paused state');
    }

    // 2. Concurrency Protection (Atomic Update)
    const updateRes = await query(`
      UPDATE step_runs
      SET status = 'completed',
          approved_by = $2,
          approved_at = NOW()
      WHERE id = $1 AND status = 'paused'
      RETURNING id
    `, [step_run_id, userId]);

    if (updateRes.rowCount === 0) {
      throw new Error('Approval failed: state was modified concurrently or no longer valid');
    }

    // Update workflow run
    await query(`
      UPDATE workflow_runs
      SET status = 'running'
      WHERE id = $1
    `, [state.workflow_run_id]);

    // 3. Resume Execution asynchronously (don't await completion for the HTTP response)
    resumeWorkflowRun(state.workflow_run_id, state.step_order + 1).catch(e => {
      logger.error('Failed during workflow resume', { error: e.message, workflow_run_id: state.workflow_run_id });
    });

    return {
      success: true,
      step_run_id
    };
  } catch (error: any) {
    logger.error('Action approveStep failed', { error: error.message });
    throw error;
  }
}
