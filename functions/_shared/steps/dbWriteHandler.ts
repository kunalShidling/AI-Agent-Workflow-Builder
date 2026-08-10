import { ExecutionContext, IStepHandler, StepOutput } from '../executor/context';
import { query } from '../utils/db';

export class DBWriteHandler implements IStepHandler {
  async execute(config: any, context: ExecutionContext): Promise<StepOutput> {
    // SECURITY: Do not allow arbitrary SQL. Insert into workflow_outputs.
    const dataToSave = config.data || context.outputs;
    
    await query(`
      INSERT INTO workflow_outputs (workflow_run_id, workflow_id, data)
      VALUES ($1, $2, $3)
    `, [context.workflowRunId, context.workflowId, JSON.stringify(dataToSave)]);
    
    return {
      status: 'completed',
      output: { saved: true }
    };
  }
}
