import { query } from './_shared/utils/db';
import { triggerWorkflowRun } from './_shared/executor/workflowExecutor';
import { logger } from './_shared/utils/logger';

export default async function scheduledTriggerHandler(req: any, res: any) {
  // Validate that the request comes from Hasura Cron Trigger
  // Hasura sets a header for webhook secret or we can check the payload if needed.
  
  try {
    // 1. Fetch all enabled scheduled triggers
    // A production implementation would use postgres cron parsing logic or date comparisons.
    // For this generic scheduler, we fetch enabled scheduled triggers and we could fire them all,
    // or evaluate cron against current minute.
    
    // For demonstration, we simply execute any workflow with an active "scheduled" trigger 
    // that needs to be run (e.g., hourly). 
    // Here we just fetch them.
    const triggersRes = await query(`
      SELECT id, workflow_id, config 
      FROM workflow_triggers 
      WHERE trigger_type = 'scheduled' AND enabled = true
    `);
    
    const triggers = triggersRes.rows;
    let firedCount = 0;
    
    for (const trigger of triggers) {
      // In a full implementation, we'd use a cron parser (like cron-parser) against trigger.config.cron
      // For this demo, we assume if it's fetched, we evaluate and run it.
      logger.info(`Scheduled trigger firing for workflow ${trigger.workflow_id}`);
      
      try {
        await triggerWorkflowRun(trigger.workflow_id, 'scheduled');
        firedCount++;
      } catch (err: any) {
        logger.error(`Failed to execute scheduled workflow ${trigger.workflow_id}:`, { error: err.message });
      }
    }
    
    res.status(200).json({ success: true, fired: firedCount });
  } catch (error: any) {
    logger.error('Scheduled trigger error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
