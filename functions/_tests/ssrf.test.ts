import { HTTPHandler } from '../_shared/steps/httpHandler';
import * as http from 'http';
import * as dns from 'dns';

jest.mock('http');
jest.mock('https');

describe('HTTP SSRF Protection', () => {
  let handler: HTTPHandler;

  beforeEach(() => {
    handler = new HTTPHandler();
    jest.clearAllMocks();
  });

  it('should block local IPs directly provided in URL', async () => {
    await expect(handler.execute({ url: 'http://127.0.0.1/admin' }, {} as any))
      .rejects.toThrow(/SSRF Protection: Access to this private IP is forbidden/);

    await expect(handler.execute({ url: 'http://10.1.2.3/admin' }, {} as any))
      .rejects.toThrow(/SSRF Protection/);

    await expect(handler.execute({ url: 'http://169.254.169.254/latest/meta-data/' }, {} as any))
      .rejects.toThrow(/SSRF Protection/);
  });

  it('should block credentials in URL', async () => {
    await expect(handler.execute({ url: 'http://admin:pass@example.com' }, {} as any))
      .rejects.toThrow(/Credentials in URL are not allowed/);
  });

  it('should allow valid public URLs', async () => {
    // Setup a mock http request that instantly returns a 200 JSON response
    const mockReq = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
    };

    (http.request as jest.Mock).mockImplementation((url, options, cb) => {
      const mockRes = {
        statusCode: 200,
        headers: { 'content-length': '15' },
        on: jest.fn((event, eventCb) => {
          if (event === 'data') eventCb(Buffer.from('{"status":"ok"}'));
          if (event === 'end') eventCb();
        }),
        destroy: jest.fn(),
      };
      cb(mockRes);
      return mockReq;
    });

    const res = await handler.execute({ url: 'http://api.github.com' }, {} as any);
    expect(res.status).toBe('completed');
    expect(res.output.status).toBe(200);
  });
});
