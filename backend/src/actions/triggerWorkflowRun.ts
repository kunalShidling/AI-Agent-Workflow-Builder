import { triggerWorkflowRun as executorTrigger } from '../executor/workflowExecutor';
import { logger } from '../utils/logger';

// Type representing a Hasura Action request payload
export interface ActionRequest {
  session_variables: Record<string, string>;
  input: any;
}

export async function triggerWorkflowRunHandler(req: ActionRequest) {
  try {
    const userId = req.session_variables['x-hasura-user-id'];
    if (!userId) {
      throw new Error('Unauthenticated request: Missing x-hasura-user-id');
    }

    const { workflow_id } = req.input;
    if (!workflow_id) {
      throw new Error('Missing workflow_id');
    }

    // Pass control to the executor logic, which handles authorization and quota
    const workflowRunId = await executorTrigger(userId, workflow_id, 'manual');
    
    return {
      workflow_run_id: workflowRunId,
      status: 'running'
    };
  } catch (error: any) {
    logger.error('Action triggerWorkflowRun failed', { error: error.message });
    throw error; // Hasura Actions expect HTTP 400 for errors
  }
}
