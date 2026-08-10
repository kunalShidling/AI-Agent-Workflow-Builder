import { ExecutionContext, IStepHandler, StepOutput } from '../executor/context';

export class ApprovalHandler implements IStepHandler {
  async execute(config: any, context: ExecutionContext): Promise<StepOutput> {
    // When approval is reached, we immediately signal PAUSED.
    return {
      status: 'paused',
      output: { message: 'Awaiting manual approval' }
    };
  }
}
