import { query } from './_shared/utils/db';
import { triggerWorkflowRun } from './_shared/executor/workflowExecutor';
import { logger } from './_shared/utils/logger';
import * as cronParser from 'cron-parser';
const parseExpression = (cronParser as any).parseExpression || (cronParser as any).default?.parseExpression;

export default async function scheduledTriggerHandler(req: any, res: any) {
  try {
    const secret = req.headers['authorization'];
    // In production we should strictly check NHOST_WEBHOOK_SECRET
    if (process.env.NHOST_WEBHOOK_SECRET && secret !== process.env.NHOST_WEBHOOK_SECRET) {
      logger.info('Unauthorized attempt to trigger scheduled workflows');
      // For safety, we enforce this check. If not set, we allow it (e.g., local dev without strict env)
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // 1. Fetch all enabled scheduled triggers
    const triggersRes = await query(`
      SELECT id, workflow_id, config 
      FROM workflow_triggers 
      WHERE trigger_type = 'scheduled' AND enabled = true
    `);
    
    const triggers = triggersRes.rows;
    let firedCount = 0;
    
    // Use a truncated minute string (YYYY-MM-DDTHH:mm) as our idempotency key
    const matchDate = new Date();
    matchDate.setSeconds(0, 0);
    const currentMinuteStr = matchDate.toISOString().substring(0, 16);
    
    for (const trigger of triggers) {
      const config = trigger.config || {};
      const cronExpr = config.cron;
      const tz = config.timezone || 'UTC';
      
      if (!cronExpr) continue;
      
      try {
        const options = {
          currentDate: new Date(matchDate.getTime() - 1000), // evaluate from 1 second before the minute
          tz
        };
        const interval = parseExpression(cronExpr, options);
        const nextTime = interval.next().getTime();
        
        // If the exact next execution time matches the start of our current minute, it is due.
        if (nextTime === matchDate.getTime()) {
          // Atomic claim to prevent concurrent scheduler instances from firing this same trigger
          const claimRes = await query(`
            UPDATE workflow_triggers
            SET config = jsonb_set(
              COALESCE(config, '{}'::jsonb),
              '{last_run_minute}',
              to_jsonb($2::text)
            )
            WHERE id = $1
              AND (config->>'last_run_minute' IS NULL OR config->>'last_run_minute' != $2)
            RETURNING id
          `, [trigger.id, currentMinuteStr]);
          
          if (claimRes.rowCount === 0) {
            // Already claimed by another concurrent invocation or previous run this minute
            continue;
          }
          
          logger.info(`Scheduled trigger firing for workflow ${trigger.workflow_id}`);
          
          // Execute asynchronously so one slow workflow doesn't block the scheduler loop
          triggerWorkflowRun(null, trigger.workflow_id, 'scheduled', null).catch(err => {
            logger.error(`Failed to execute scheduled workflow ${trigger.workflow_id}:`, { error: err.message });
          });
          
          firedCount++;
        }
      } catch (err: any) {
        logger.error(`Failed to parse cron or execute workflow ${trigger.workflow_id}:`, { error: err.message });
      }
    }
    
    res.status(200).json({ success: true, fired: firedCount });
  } catch (error: any) {
    logger.error('Scheduled trigger error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
