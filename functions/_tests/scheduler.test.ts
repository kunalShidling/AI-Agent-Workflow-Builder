import scheduledTriggerHandler from '../scheduledTrigger';
import { query } from '../_shared/utils/db';
import { triggerWorkflowRun } from '../_shared/executor/workflowExecutor';
import * as cronParser from 'cron-parser';

jest.mock('../_shared/utils/db', () => ({ query: jest.fn() }));
jest.mock('../_shared/executor/workflowExecutor', () => ({ triggerWorkflowRun: jest.fn().mockResolvedValue(true) }));
jest.mock('../_shared/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

jest.mock('cron-parser', () => ({
  parseExpression: jest.fn().mockImplementation((cron, options) => {
    // Only fire if cron is * * * * *
    const isMatch = cron === '* * * * *';
    return {
      next: () => ({
        getTime: () => options.currentDate.getTime() + (isMatch ? 1000 : 2000)
      })
    };
  })
}));

describe('Scheduled Trigger', () => {
  let mockRes: any;
  beforeEach(() => {
    jest.clearAllMocks();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  it('should parse valid cron and prevent duplicate execution', async () => {
    const matchDate = new Date();
    matchDate.setSeconds(0, 0);

    // Setup a trigger that is due EXACTLY now
    (query as jest.Mock).mockResolvedValueOnce({
      rows: [
        { id: 't1', workflow_id: 'w1', config: { cron: '* * * * *', timezone: 'UTC' } }, // Due every minute
        { id: 't2', workflow_id: 'w2', config: { cron: '0 0 1 1 *', timezone: 'UTC' } }, // Not due
      ]
    });

    // Mock atomic claim success for t1
    (query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 });

    await scheduledTriggerHandler({ headers: {} }, mockRes);

    expect(query).toHaveBeenCalledTimes(2);

    // Check parameters passed to triggerWorkflowRun
    // Signature: triggerWorkflowRun(userId, workflowId, triggerType, payload)
    expect(triggerWorkflowRun).toHaveBeenCalledWith(null, 'w1', 'scheduled', null);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({ success: true, fired: 1 });
  });

  it('should not fire if atomic claim fails (concurrent scheduler)', async () => {
    (query as jest.Mock).mockResolvedValueOnce({
      rows: [
        { id: 't1', workflow_id: 'w1', config: { cron: '* * * * *', timezone: 'UTC' } },
      ]
    });

    // Mock atomic claim FAILURE
    (query as jest.Mock).mockResolvedValueOnce({ rowCount: 0 });

    await scheduledTriggerHandler({ headers: {} }, mockRes);

    expect(triggerWorkflowRun).not.toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith({ success: true, fired: 0 });
  });
});
