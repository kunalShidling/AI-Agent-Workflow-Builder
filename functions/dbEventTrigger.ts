import { query } from './_shared/utils/db';
import { triggerWorkflowRun } from './_shared/executor/workflowExecutor';
import { logger } from './_shared/utils/logger';

export default async function dbEventTriggerHandler(req: any, res: any) {
  try {
    const payload = req.body;
    
    if (!payload || !payload.event || !payload.table) {
      return res.status(400).json({ error: 'Invalid Hasura event payload' });
    }
    
    const tableName = payload.table.name;
    const operation = payload.event.op; // INSERT, UPDATE, DELETE
    const rowData = payload.event.data.new || payload.event.data.old;
    
    logger.info(`Received DB event trigger for table: ${tableName}, op: ${operation}`);
    
    // Find any workflows listening to this exact database event
    const triggersRes = await query(`
      SELECT id, workflow_id, config 
      FROM workflow_triggers 
      WHERE trigger_type = 'database_event' AND enabled = true
    `);
    
    let firedCount = 0;
    
    for (const trigger of triggersRes.rows) {
      const config = trigger.config || {};
      
      // If the trigger config matches the table and operation
      if (config.table === tableName && config.operation === operation) {
        logger.info(`Event trigger matched for workflow ${trigger.workflow_id}`);
        
        try {
          // Fire the workflow, injecting the row data as the input context if needed
          // Fire the workflow, injecting the row data as the input context
          await triggerWorkflowRun(trigger.workflow_id, 'database_event', rowData);
          firedCount++;
        } catch (err: any) {
          logger.error(`Failed to execute event workflow ${trigger.workflow_id}:`, { error: err.message });
        }
      }
    }
    
    res.status(200).json({ success: true, fired: firedCount });
  } catch (error: any) {
    logger.error('DB Event trigger error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
