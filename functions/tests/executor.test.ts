import { executeStep } from '../src/executor/stepExecutor';
import { triggerWorkflowRun } from '../src/executor/workflowExecutor';
import { ExecutionContext } from '../src/executor/context';
import fetch from 'node-fetch';
import * as authService from '../src/services/authorizationService';
import * as quotaService from '../src/services/quotaService';
import * as workflowService from '../src/services/workflowService';
import * as executionService from '../src/services/executionService';
import * as db from '../src/utils/db';

jest.mock('node-fetch');
jest.mock('../src/utils/db');
jest.mock('../src/services/authorizationService');
jest.mock('../src/services/quotaService');
jest.mock('../src/services/workflowService');
jest.mock('../src/services/executionService');

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('Workflow Executor', () => {
  let context: ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_API_KEY = 'test_key';
    
    context = {
      workflowRunId: 'run-1',
      workflowId: 'wf-1',
      outputs: {}
    };
  });

  describe('Step Handlers', () => {
    
    test('successful LLM execution', async () => {
      const mockResponse = { choices: [{ message: { content: 'positive result' } }] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as any);

      const res = await executeStep('step-1', 'llm_call', { prompt: 'Test' }, context);
      
      expect(res.status).toBe('completed');
      expect(res.output.response).toBe('positive result');
      expect(executionService.updateStepRun).toHaveBeenCalledWith('step-1', 'completed', expect.any(Object), null, true);
    });

    test('failed LLM + retry -> attempt_count increments correctly', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Error' } as any)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'success on retry' } }] }) } as any);

      const res = await executeStep('step-2', 'llm_call', { prompt: 'Test' }, context);
      
      expect(res.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      // First call (failure update, running state, attempt_count + 1)
      expect(executionService.updateStepRun).toHaveBeenNthCalledWith(1, 'step-2', 'running', null, expect.any(String), true);
      // Second call (success update, completed state, attempt_count + 1)
      expect(executionService.updateStepRun).toHaveBeenNthCalledWith(2, 'step-2', 'completed', expect.any(Object), null, true);
    });

    test('successful HTTP request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true })
      } as any);

      const res = await executeStep('step-3', 'http_request', { url: 'https://test.com', method: 'GET' }, context);
      
      expect(res.status).toBe('completed');
      expect(res.output.data.success).toBe(true);
    });

    test('failed HTTP + retry -> workflow failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal Error' } as any);

      const res = await executeStep('step-4', 'http_request', { url: 'https://test.com' }, context);
      
      expect(res.status).toBe('failed');
      expect(mockFetch).toHaveBeenCalledTimes(2); // Retries once (max 2 attempts)
      
      // Attempt 1 fails -> running
      expect(executionService.updateStepRun).toHaveBeenNthCalledWith(1, 'step-4', 'running', null, expect.any(String), true);
      // Attempt 2 fails -> failed
      expect(executionService.updateStepRun).toHaveBeenNthCalledWith(2, 'step-4', 'failed', null, expect.any(String), true);
    });

    test('conditional TRUE', async () => {
      context.outputs = { 'prev-step': { response: 'this is a positive outcome' } };
      // Template {{input}} resolves to the stringified last output or raw string if we simplified it.
      // Since our simple resolvePlaceholders grabs the last object, we can test it directly.
      
      const res = await executeStep('step-5', 'conditional_branch', { value: 'positive', operator: 'contains' }, context);
      
      expect(res.status).toBe('completed');
      expect(res.output.evaluated).toBe(true);
    });

    test('conditional FALSE', async () => {
      context.outputs = { 'prev-step': 'this is a negative outcome' };
      const res = await executeStep('step-6', 'conditional_branch', { value: 'positive', operator: 'contains' }, context);
      
      expect(res.status).toBe('completed');
      expect(res.output.evaluated).toBe(false);
    });

    test('DB write', async () => {
      const res = await executeStep('step-7', 'db_write', { data: { custom: 'value' } }, context);
      
      expect(res.status).toBe('completed');
      expect(res.output.saved).toBe(true);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workflow_outputs'), expect.any(Array));
    });

  });

  describe('Workflow Execution (triggerWorkflowRun)', () => {
    beforeEach(() => {
      (authService.verifyTriggerPermission as jest.Mock).mockResolvedValue({ orgId: 'org-1', role: 'owner' });
      (quotaService.checkAndConsumeQuota as jest.Mock).mockResolvedValue(true);
      (executionService.createWorkflowRun as jest.Mock).mockResolvedValue('run-1');
      (executionService.createStepRun as jest.Mock).mockResolvedValue('step-run-1');
    });

    test('approval gate pauses execution', async () => {
      // Mock workflow steps
      (workflowService.getWorkflowSteps as jest.Mock).mockResolvedValue([
        { id: 's1', type: 'llm_call', config: {} },
        { id: 's2', type: 'approval_gate', config: {} },
        { id: 's3', type: 'db_write', config: {} }
      ]);
      
      // Mock LLM step to succeed
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'test' } }] }) } as any);

      await triggerWorkflowRun('user-1', 'wf-1');
      
      // Workflow should be updated to paused
      expect(executionService.updateWorkflowRun).toHaveBeenCalledWith('run-1', 'paused');
      
      // DB write step should NOT be reached
      expect(db.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workflow_outputs'), expect.any(Array));
    });

  });
});
