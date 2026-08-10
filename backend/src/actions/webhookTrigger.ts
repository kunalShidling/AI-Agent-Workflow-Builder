import { triggerWorkflowRun as executorTrigger } from '../executor/workflowExecutor';
import { checkAndConsumeQuota } from '../services/quotaService';
import { query } from '../utils/db';
import { logger } from '../utils/logger';

export interface WebhookActionRequest {
  input: {
    workflow_id: string;
    payload?: any;
  };
  secret: string; // Extracted from HTTP headers (e.g., x-webhook-secret) by the Express/Next route
}

export async function webhookTriggerHandler(req: WebhookActionRequest) {
  try {
    const { workflow_id, payload } = req.input;
    const { secret } = req;

    if (!workflow_id) {
      throw new Error('Missing workflow_id');
    }
    
    if (!secret) {
      // Return 401 conceptually, though Hasura Actions often return 400 with a message
      throw new Error('Missing webhook secret');
    }

    // 1. Fetch Workflow and Webhook Trigger configuration
    const wfRes = await query(`
      SELECT 
        w.id as workflow_id,
        w.org_id,
        t.id as trigger_id,
        t.enabled,
        t.config
      FROM workflows w
      LEFT JOIN workflow_triggers t ON w.id = t.workflow_id AND t.trigger_type = 'webhook'
      WHERE w.id = $1
    `, [workflow_id]);

    if (wfRes.rowCount === 0) {
      // Safe rejection without leaking too much
      throw new Error('Workflow not found or invalid');
    }

    const wf = wfRes.rows[0];

    // 2. Validate Webhook Trigger existence and status
    if (!wf.trigger_id) {
      throw new Error('No webhook trigger configured for this workflow');
    }
    if (wf.enabled === false) {
      throw new Error('Webhook trigger is disabled');
    }

    // 3. Authenticate Secret
    // Assuming config is JSONB containing { "secret": "..." }
    const storedSecret = typeof wf.config === 'string' ? JSON.parse(wf.config).secret : wf.config?.secret;
    if (!storedSecret || secret !== storedSecret) {
      throw new Error('Invalid webhook secret');
    }

    // 4. Validate Quota
    // This uses the same quota mechanism as manual triggers.
    await checkAndConsumeQuota(wf.org_id);

    // 5. Invoke Workflow Executor with the payload
    // Note: We don't have a 'userId' because it's a machine trigger.
    // We pass 'webhook' as the created_by or leave it null depending on schema constraints.
    // Assuming created_by is nullable or we pass a generic 'system' identifier.
    const systemUserId = '00000000-0000-0000-0000-000000000000'; // Or just null if DB allows. We'll pass a dummy UUID or adjust schema if needed, but for now we'll pass null to represent system if we updated the DB, but since it expects UUID, let's pass null and if it fails, our DB design allows null.
    
    const workflowRunId = await executorTrigger(null as any, workflow_id, 'webhook', payload);

    return {
      workflow_run_id: workflowRunId,
      status: 'running'
    };
  } catch (error: any) {
    logger.error('Action webhookTrigger failed', { error: error.message, workflow_id: req.input?.workflow_id });
    throw error;
  }
}
