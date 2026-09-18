import { approveStepHandler } from '../_shared/actions/approveStep';
import { webhookTriggerHandler } from '../_shared/actions/webhookTrigger';
import { checkAndConsumeQuota } from '../_shared/services/quotaService';
import { query } from '../_shared/utils/db';

jest.mock('../_shared/utils/db', () => ({ query: jest.fn() }));
jest.mock('../_shared/executor/workflowExecutor', () => ({ resumeWorkflowRun: jest.fn().mockResolvedValue(true), triggerWorkflowRun: jest.fn().mockResolvedValue('run-1') }));

describe('Authorization & Concurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Approval Authorization', () => {
    it('should allow owner or editor to approve', async () => {
      (query as jest.Mock).mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ step_status: 'paused', run_status: 'paused', step_type: 'approval_gate', step_order: 1, role: 'owner', workflow_run_id: 'wfr-1' }]
      });
      (query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 }); // Update step
      (query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 }); // Update run

      const res = await approveStepHandler({
        session_variables: { 'x-hasura-user-id': 'u1' },
        input: { step_run_id: 'sr1' }
      });
      expect(res.success).toBe(true);
    });

    it('should deny viewer from approving', async () => {
      (query as jest.Mock).mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ step_status: 'paused', run_status: 'paused', step_type: 'approval_gate', step_order: 1, role: 'viewer', workflow_run_id: 'wfr-1' }]
      });

      await expect(approveStepHandler({
        session_variables: { 'x-hasura-user-id': 'u1' },
        input: { step_run_id: 'sr1' }
      })).rejects.toThrow(/Unauthorized/);
    });
  });

  describe('Webhook Authentication', () => {
    it('should reject invalid secrets securely', async () => {
      (query as jest.Mock).mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ trigger_id: 't1', enabled: true, config: { secret: 'secret-a' }, org_id: 'o1' }]
      });

      await expect(webhookTriggerHandler({
        secret: 'secret-b',
        input: { workflow_id: 'w1' }
      })).rejects.toThrow(/Invalid webhook secret/);
    });
  });

  describe('Quota Concurrency', () => {
    it('should throw if quota is exceeded (0 rows updated)', async () => {
      (query as jest.Mock).mockResolvedValueOnce({ rowCount: 0 }); // Simulate atomic failure

      await expect(checkAndConsumeQuota('org1')).rejects.toThrow(/Quota exceeded/);
    });
  });
});
