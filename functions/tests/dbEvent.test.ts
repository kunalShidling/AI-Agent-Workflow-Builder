import dbEventTriggerHandler from '../dbEventTrigger';
import { query } from '../_shared/utils/db';
import { triggerWorkflowRun } from '../_shared/executor/workflowExecutor';

jest.mock('../_shared/utils/db', () => ({ query: jest.fn() }));
jest.mock('../_shared/executor/workflowExecutor', () => ({ triggerWorkflowRun: jest.fn().mockResolvedValue(true) }));
jest.mock('../_shared/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

describe('DB Event Trigger', () => {
  let mockRes: any;
  beforeEach(() => {
    jest.clearAllMocks();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  it('should format payload and preserve argument order for workflowExecutor', async () => {
    (query as jest.Mock).mockResolvedValueOnce({
      rows: [
        { id: 't1', workflow_id: 'w-123', config: { table: 'users', operation: 'INSERT' } }
      ]
    });

    const mockReq = {
      body: {
        event: {
          op: 'INSERT',
          data: {
            old: null,
            new: { id: 1, name: 'Test' }
          }
        },
        table: { name: 'users' }
      }
    };

    await dbEventTriggerHandler(mockReq, mockRes);

    expect(triggerWorkflowRun).toHaveBeenCalledWith(
      null,
      'w-123',
      'database_event',
      {
        trigger: { type: 'database_event', table: 'users', operation: 'INSERT' },
        data: { new: { id: 1, name: 'Test' }, old: null }
      }
    );
    expect(mockRes.json).toHaveBeenCalledWith({ success: true, fired: 1 });
  });
});
