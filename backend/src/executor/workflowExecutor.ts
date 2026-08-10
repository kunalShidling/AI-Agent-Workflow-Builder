import { getWorkflowSteps } from '../services/workflowService';
import { createWorkflowRun, createStepRun, updateWorkflowRun } from '../services/executionService';
import { verifyTriggerPermission } from '../services/authorizationService';
import { checkAndConsumeQuota } from '../services/quotaService';
import { executeStep } from './stepExecutor';
import { ExecutionContext } from './context';
import { logger } from '../utils/logger';

export async function triggerWorkflowRun(
  userId: string | null, 
  workflowId: string, 
  triggerType: string = 'manual',
  triggerPayload: any = null
) {
  logger.info('triggerWorkflowRun initiated', { workflowId, userId, triggerType });
  
  // 1. Authenticate and Authorize (Layer 1 Security) - Only if manual
  let orgId: string;
  if (triggerType === 'manual' && userId) {
    const authRes = await verifyTriggerPermission(userId, workflowId);
    orgId = authRes.orgId;
    
    // 2. Check Quota (Manual only, webhook handles its own prior to calling this to save DB roundtrips, but we can do it here if needed)
    // We'll trust the webhook handler did the quota check, but for purity, let's do manual quota here.
    await checkAndConsumeQuota(orgId);
  } else {
    // Webhook - quota was checked in the handler. We just need orgId for logging if needed.
  }
  
  // 3. Create workflow_run
  const workflowRunId = await createWorkflowRun(workflowId, triggerType, userId || '00000000-0000-0000-0000-000000000000');
  
  // 4. Fetch ordered steps
  const steps = await getWorkflowSteps(workflowId);
  if (steps.length === 0) {
    await updateWorkflowRun(workflowRunId, 'completed');
    return workflowRunId;
  }
  
  // 5. Initialize Context
  const context: ExecutionContext = {
    workflowRunId,
    workflowId,
    outputs: {},
    triggerPayload
  };
  
  // 6. Sequential Execution Loop
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    // Create step_run row (Initial state: running)
    const stepRunId = await createStepRun(workflowRunId, step.id);
    
    // Execute Step via Dispatcher
    const result = await executeStep(stepRunId, step.type, step.config, context);
    
    if (result.status === 'paused') {
      // Approval gate reached
      await updateWorkflowRun(workflowRunId, 'paused');
      logger.info('Workflow paused at approval gate', { workflowRunId, stepRunId });
      return workflowRunId; // STOP execution
    }
    
    if (result.status === 'failed') {
      // Step failed -> Workflow failed
      await updateWorkflowRun(workflowRunId, 'failed', result.error);
      logger.error('Workflow failed', { workflowRunId, stepRunId, error: result.error });
      return workflowRunId;
    }
    
    // Step completed successfully
    context.outputs[step.id] = result.output;
    
    // Note: If Conditional step returns false, we might want to skip the rest or branch.
    // For a simple linear workflow, if a condition evaluates to false, we can complete the workflow early.
    if (step.type === 'conditional_branch' && result.output?.evaluated === false) {
      logger.info('Conditional evaluated to FALSE, stopping linear execution', { workflowRunId });
      break;
    }
  }
  
  // 7. Complete Workflow
  await updateWorkflowRun(workflowRunId, 'completed');
  logger.info('Workflow completed successfully', { workflowRunId });
  
  return workflowRunId;
}

export async function resumeWorkflowRun(workflowRunId: string, startFromStepOrder: number) {
  logger.info('resumeWorkflowRun initiated', { workflowRunId, startFromStepOrder });

  // 1. Fetch workflow run details
  const runRes = await query('SELECT workflow_id FROM workflow_runs WHERE id = $1', [workflowRunId]);
  if (runRes.rowCount === 0) throw new Error('Workflow run not found');
  const workflowId = runRes.rows[0].workflow_id;

  // 2. Fetch steps
  const steps = await getWorkflowSteps(workflowId);
  const remainingSteps = steps.filter(s => s.step_order >= startFromStepOrder);

  if (remainingSteps.length === 0) {
    await updateWorkflowRun(workflowRunId, 'completed');
    return;
  }

  // 3. Reconstruct context from previous step runs
  const context: ExecutionContext = { workflowRunId, workflowId, outputs: {} };
  const prevStepsRes = await query(`
    SELECT workflow_step_id, output 
    FROM step_runs 
    WHERE workflow_run_id = $1 AND status = 'completed'
  `, [workflowRunId]);
  
  for (const row of prevStepsRes.rows) {
    if (row.output) {
      context.outputs[row.workflow_step_id] = typeof row.output === 'string' ? JSON.parse(row.output) : row.output;
    }
  }

  // 4. Sequential Execution Loop (Resume)
  for (let i = 0; i < remainingSteps.length; i++) {
    const step = remainingSteps[i];
    
    const stepRunId = await createStepRun(workflowRunId, step.id);
    const result = await executeStep(stepRunId, step.type, step.config, context);
    
    if (result.status === 'paused') {
      await updateWorkflowRun(workflowRunId, 'paused');
      logger.info('Workflow paused at next approval gate', { workflowRunId, stepRunId });
      return;
    }
    
    if (result.status === 'failed') {
      await updateWorkflowRun(workflowRunId, 'failed', result.error);
      logger.error('Workflow failed during resume', { workflowRunId, stepRunId, error: result.error });
      return;
    }
    
    context.outputs[step.id] = result.output;
    
    if (step.type === 'conditional_branch' && result.output?.evaluated === false) {
      break;
    }
  }
  
  await updateWorkflowRun(workflowRunId, 'completed');
  logger.info('Workflow completed successfully after resume', { workflowRunId });
}
