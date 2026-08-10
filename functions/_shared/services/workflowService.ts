import { query } from '../utils/db';

export async function getWorkflowSteps(workflowId: string) {
  const res = await query(`
    SELECT id, step_order, name, type, config
    FROM workflow_steps
    WHERE workflow_id = $1
    ORDER BY step_order ASC
  `, [workflowId]);
  
  return res.rows;
}
