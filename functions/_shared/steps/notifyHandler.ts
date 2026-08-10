import { ExecutionContext, IStepHandler, StepOutput } from '../executor/context';
import { logger } from '../utils/logger';

export class NotifyHandler implements IStepHandler {
  async execute(config: any, context: ExecutionContext): Promise<StepOutput> {
    const message = config.message || 'Workflow notification';
    
    // In a real architecture, we insert into a `notifications` table 
    // and let Hasura Event Triggers handle the actual Slack API call.
    // For now, we simulate this event-driven architecture by logging.
    logger.info('Simulating Hasura Event Trigger for notification', { message, workflowId: context.workflowId });
    
    return {
      status: 'completed',
      output: { notified: true, method: 'event_trigger_simulation' }
    };
  }
}
