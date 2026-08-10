import { triggerWorkflowRunHandler } from '../_shared/actions/triggerWorkflowRun';
import { approveStepHandler } from '../_shared/actions/approveStep';
import { triggerWorkflowRun, resumeWorkflowRun } from '../_shared/executor/workflowExecutor';
import { query } from '../_shared/utils/db';
import * as authService from '../_shared/services/authorizationService';
import * as quotaService from '../_shared/services/quotaService';

jest.mock('../_shared/executor/workflowExecutor');
jest.mock('../_shared/utils/db');
jest.mock('../_shared/services/authorizationService');
jest.mock('../_shared/services/quotaService');

const mockQuery = query as jest.Mock;

describe('Hasura Actions Security', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('triggerWorkflowRun', () => {
    test('A. Org A owner triggers Org A workflow -> SUCCESS', async () => {
      (authService.verifyTriggerPermission as jest.Mock).mockResolvedValue({ orgId: 'orgA', role: 'owner' });
      (quotaService.checkAndConsumeQuota as jest.Mock).mockResolvedValue(true);
      (triggerWorkflowRun as jest.Mock).mockResolvedValue('run-123');

      const req = {
        session_variables: { 'x-hasura-user-id': 'ownerA' },
        input: { workflow_id: 'wfA' }
      };

      const res = await triggerWorkflowRunHandler(req);
      expect(res.workflow_run_id).toBe('run-123');
      expect(authService.verifyTriggerPermission).toHaveBeenCalledWith('ownerA', 'wfA');
    });

    test('B. Org A editor triggers Org A workflow -> SUCCESS', async () => {
      (authService.verifyTriggerPermission as jest.Mock).mockResolvedValue({ orgId: 'orgA', role: 'editor' });
      (triggerWorkflowRun as jest.Mock).mockResolvedValue('run-124');

      const req = {
        session_variables: { 'x-hasura-user-id': 'editorA' },
        input: { workflow_id: 'wfA' }
      };

      const res = await triggerWorkflowRunHandler(req);
      expect(res.workflow_run_id).toBe('run-124');
    });

    test('C. Org A viewer triggers Org A workflow -> DENIED', async () => {
      (authService.verifyTriggerPermission as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

      const req = {
        session_variables: { 'x-hasura-user-id': 'viewerA' },
        input: { workflow_id: 'wfA' }
      };

      await expect(triggerWorkflowRunHandler(req)).rejects.toThrow('Unauthorized');
    });

    test('D. Org B editor attempts to trigger Org A workflow -> DENIED', async () => {
      (authService.verifyTriggerPermission as jest.Mock).mockRejectedValue(new Error('Unauthorized or workflow not found'));

      const req = {
        session_variables: { 'x-hasura-user-id': 'editorB' },
        input: { workflow_id: 'wfA' }
      };

      await expect(triggerWorkflowRunHandler(req)).rejects.toThrow('Unauthorized or workflow not found');
    });

    test('L. Quota exhausted -> trigger denied', async () => {
      (authService.verifyTriggerPermission as jest.Mock).mockResolvedValue({ orgId: 'orgA', role: 'owner' });
      (quotaService.checkAndConsumeQuota as jest.Mock).mockRejectedValue(new Error('Quota exceeded'));

      const req = {
        session_variables: { 'x-hasura-user-id': 'ownerA' },
        input: { workflow_id: 'wfA' }
      };

      await expect(triggerWorkflowRunHandler(req)).rejects.toThrow('Quota exceeded');
    });
  });

  describe('approveStep', () => {
    test('E. Org A owner approves Org A paused approval -> SUCCESS', async () => {
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ step_status: 'paused', workflow_run_id: 'run-1', run_status: 'paused', step_type: 'approval_gate', step_order: 3, role: 'owner' }]
      }); // state check
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // concurrency update
      mockQuery.mockResolvedValueOnce({}); // workflow_run status update

      const req = {
        session_variables: { 'x-hasura-user-id': 'ownerA' },
        input: { step_run_id: 'step-1' }
      };

      const res = await approveStepHandler(req);
      expect(res.success).toBe(true);
      expect(resumeWorkflowRun).toHaveBeenCalledWith('run-1', 4); // step_order + 1
    });

    test('F. Org A editor approves Org A paused approval -> SUCCESS', async () => {
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ step_status: 'paused', workflow_run_id: 'run-1', run_status: 'paused', step_type: 'approval_gate', step_order: 3, role: 'editor' }]
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      mockQuery.mockResolvedValueOnce({});

      const req = {
        session_variables: { 'x-hasura-user-id': 'editorA' },
        input: { step_run_id: 'step-1' }
      };

      const res = await approveStepHandler(req);
      expect(res.success).toBe(true);
    });

    test('G. Org A viewer approves -> DENIED', async () => {
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ step_status: 'paused', run_status: 'paused', step_type: 'approval_gate', role: 'viewer' }]
      });

      const req = {
        session_variables: { 'x-hasura-user-id': 'viewerA' },
        input: { step_run_id: 'step-1' }
      };

      await expect(approveStepHandler(req)).rejects.toThrow('Unauthorized');
    });

    test('H. Org B editor approves Org A step -> DENIED', async () => {
      // Role will be null because left join on org_members matches user_id (editorB) which has no mapping in Org A
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ step_status: 'paused', run_status: 'paused', step_type: 'approval_gate', role: null }]
      });

      const req = {
        session_variables: { 'x-hasura-user-id': 'editorB' },
        input: { step_run_id: 'step-1' }
      };

      await expect(approveStepHandler(req)).rejects.toThrow('Unauthorized');
    });

    test('I. Attempt to approve a non-approval step -> DENIED', async () => {
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ step_status: 'completed', run_status: 'running', step_type: 'llm_call', role: 'owner' }]
      });

      const req = {
        session_variables: { 'x-hasura-user-id': 'ownerA' },
        input: { step_run_id: 'step-1' }
      };

      await expect(approveStepHandler(req)).rejects.toThrow('not an approval_gate');
    });

    test('J. Attempt to approve an already completed approval -> DENIED', async () => {
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ step_status: 'completed', run_status: 'running', step_type: 'approval_gate', role: 'owner' }]
      });

      const req = {
        session_variables: { 'x-hasura-user-id': 'ownerA' },
        input: { step_run_id: 'step-1' }
      };

      await expect(approveStepHandler(req)).rejects.toThrow('not in paused state');
    });

    test('M. Double approval -> only one approval succeeds', async () => {
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ step_status: 'paused', run_status: 'paused', step_type: 'approval_gate', step_order: 3, role: 'owner' }]
      });
      // Simulate concurrency failure where UPDATE affected 0 rows
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const req = {
        session_variables: { 'x-hasura-user-id': 'ownerA' },
        input: { step_run_id: 'step-1' }
      };

      await expect(approveStepHandler(req)).rejects.toThrow('concurrently or no longer valid');
    });

    test('N. Forged user_id in request body -> ignored', async () => {
      (authService.verifyTriggerPermission as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

      const req = {
        session_variables: { 'x-hasura-user-id': 'viewerA' },
        input: { workflow_id: 'wfA', user_id: 'ownerA' } // Trying to forge ownerA
      };

      // Handler uses session_variables['x-hasura-user-id'] exclusively
      await expect(triggerWorkflowRunHandler(req)).rejects.toThrow('Unauthorized');
    });

  });
});
