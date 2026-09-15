import { ExecutionContext, IStepHandler, StepOutput } from './context';
import { LLMHandler } from '../steps/llmHandler';
import { HTTPHandler } from '../steps/httpHandler';
import { ConditionalHandler } from '../steps/conditionalHandler';
import { ApprovalHandler } from '../steps/approvalHandler';
import { DBWriteHandler } from '../steps/dbWriteHandler';
import { NotifyHandler } from '../steps/notifyHandler';
import { logger } from '../utils/logger';
import { updateStepRun } from '../services/executionService';

const handlers: Record<string, IStepHandler> = {
  llm_call: new LLMHandler(),
  http_request: new HTTPHandler(),
  conditional_branch: new ConditionalHandler(),
  approval_gate: new ApprovalHandler(),
  db_write: new DBWriteHandler(),
  notify: new NotifyHandler()
};

export async function executeStep(
  stepRunId: string,
  stepType: string, 
  config: any, 
  context: ExecutionContext
): Promise<StepOutput> {
  const handler = handlers[stepType];
  if (!handler) {
    throw new Error(`Unknown step type: ${stepType}`);
  }
  
  const maxAttempts = (stepType === 'llm_call' || stepType === 'http_request') ? 2 : 1;
  let attempt = 0;
  
  while (attempt < maxAttempts) {
    attempt++;
    logger.info(`Executing step ${stepRunId}`, { stepType, attempt, workflowRunId: context.workflowRunId });
    
    try {
      // Execute the handler logic
      const result = await handler.execute(config, context);
      
      // Update step run in DB
      await updateStepRun(stepRunId, result.status, result.output, null, true);
      
      return result;
    } catch (e: any) {
      logger.error(`Step ${stepRunId} failed`, { error: e.message, stepType, attempt });
      
      // Update DB with error and attempt count
      await updateStepRun(stepRunId, attempt < maxAttempts ? 'running' : 'failed', null, e.message, true);
      
      if (attempt >= maxAttempts) {
        return { status: 'failed', error: e.message };
      }
      
      // Bounded exponential backoff with jitter
      const baseDelay = 1000;
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 500;
      const delay = Math.min(exponentialDelay + jitter, 10000); // Max 10 seconds per retry
      await new Promise(res => setTimeout(res, delay));
    }
  }
  
  return { status: 'failed', error: 'Max attempts reached' };
}
