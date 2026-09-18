import { webhookTriggerHandler } from '../_shared/actions/webhookTrigger';
import { triggerWorkflowRun as executorTrigger } from '../_shared/executor/workflowExecutor';
import { query } from '../_shared/utils/db';
import { checkAndConsumeQuota } from '../_shared/services/quotaService';

jest.mock('../_shared/executor/workflowExecutor');
jest.mock('../_shared/utils/db');
jest.mock('../_shared/services/quotaService');

const mockQuery = query as jest.Mock;

describe('Webhook Trigger Security & Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('A. Valid webhook -> workflow starts', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ workflow_id: 'wf1', org_id: 'org1', trigger_id: 'trig1', enabled: true, config: { secret: 'my-secret' } }]
    });
    (checkAndConsumeQuota as jest.Mock).mockResolvedValue(true);
    (executorTrigger as jest.Mock).mockResolvedValue('run123');

    const req = {
      input: { workflow_id: 'wf1', payload: { customer: 'John' } },
      secret: 'my-secret'
    };

    const res = await webhookTriggerHandler(req);
    expect(res.workflow_run_id).toBe('run123');
    expect(executorTrigger).toHaveBeenCalledWith(null, 'wf1', 'webhook', { customer: 'John' });
  });

  test('B. Invalid secret -> denied', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ workflow_id: 'wf1', org_id: 'org1', trigger_id: 'trig1', enabled: true, config: { secret: 'my-secret' } }]
    });

    const req = {
      input: { workflow_id: 'wf1' },
      secret: 'wrong-secret'
    };

    await expect(webhookTriggerHandler(req)).rejects.toThrow('Invalid webhook secret');
  });

  test('C. Missing webhook trigger -> denied', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ workflow_id: 'wf1', org_id: 'org1', trigger_id: null }] // No trigger joined
    });

    const req = {
      input: { workflow_id: 'wf1' },
      secret: 'my-secret'
    };

    await expect(webhookTriggerHandler(req)).rejects.toThrow('No webhook trigger configured');
  });

  test('D. Disabled webhook -> denied', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ workflow_id: 'wf1', org_id: 'org1', trigger_id: 'trig1', enabled: false, config: { secret: 'my-secret' } }]
    });

    const req = {
      input: { workflow_id: 'wf1' },
      secret: 'my-secret'
    };

    await expect(webhookTriggerHandler(req)).rejects.toThrow('Webhook trigger is disabled');
  });

  test('E. Unknown workflow -> safely rejected', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const req = {
      input: { workflow_id: 'invalid-wf' },
      secret: 'my-secret'
    };

    await expect(webhookTriggerHandler(req)).rejects.toThrow('Workflow not found or invalid');
  });

  test('F. Quota exhausted -> denied', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ workflow_id: 'wf1', org_id: 'org1', trigger_id: 'trig1', enabled: true, config: { secret: 'my-secret' } }]
    });
    (checkAndConsumeQuota as jest.Mock).mockRejectedValue(new Error('Quota exceeded'));

    const req = {
      input: { workflow_id: 'wf1' },
      secret: 'my-secret'
    };

    await expect(webhookTriggerHandler(req)).rejects.toThrow('Quota exceeded');
    expect(executorTrigger).not.toHaveBeenCalled();
  });

  // G - N are mostly executor level or integration tests.
  // We can test context resolution for G directly here.
  test('G. Valid webhook payload reaches LLM step via context placeholder', () => {
    import { resolvePlaceholders } from '../_shared/executor/context';
    const context = {
      workflowRunId: 'run1',
      workflowId: 'wf1',
      outputs: {},
      triggerPayload: { message: 'hello world' }
    };
    const resolved = resolvePlaceholders('Process: {{trigger.payload.message}}', context);
    expect(resolved).toBe('Process: hello world');
  });
});
