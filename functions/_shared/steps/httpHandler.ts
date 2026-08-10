import { ExecutionContext, IStepHandler, StepOutput, resolvePlaceholders } from '../executor/context';

export class HTTPHandler implements IStepHandler {
  async execute(config: any, context: ExecutionContext): Promise<StepOutput> {
    // SECURITY: SSRF Considerations. 
    // Ideally, we should validate 'url' against an allowlist or block internal IPs (10.x, 192.168.x, 127.x).
    const url = resolvePlaceholders(config.url, context);
    if (!url || !url.startsWith('http')) {
      throw new Error('Invalid URL');
    }
    
    const method = config.method || 'GET';
    const headers = config.headers || {};
    
    let body = undefined;
    if (config.body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      const resolvedBody = resolvePlaceholders(typeof config.body === 'string' ? config.body : JSON.stringify(config.body), context);
      body = resolvedBody;
    }

    const res = await fetch(url, { method, headers, body });
    
    let outputData;
    const text = await res.text();
    try {
      outputData = JSON.parse(text);
    } catch {
      outputData = text;
    }
    
    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status} ${text}`);
    }
    
    return {
      status: 'completed',
      output: { status: res.status, data: outputData }
    };
  }
}
