import { ExecutionContext, IStepHandler, StepOutput, resolvePlaceholders } from '../executor/context';
import { URL } from 'url';

function isBlockedHost(hostname: string): boolean {
  // SSRF Protection: Block internal and private IPs / hosts
  const blockedPatterns = [
    /^localhost$/i,
    /^127\.\d+\.\d+\.\d+$/, // 127.0.0.0/8
    /^10\.\d+\.\d+\.\d+$/,  // 10.0.0.0/8
    /^192\.168\.\d+\.\d+$/, // 192.168.0.0/16
    /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/, // 172.16.0.0/12
    /^169\.254\.\d+\.\d+$/, // 169.254.0.0/16 (Cloud Metadata)
    /^::1$/, // IPv6 loopback
    /^[fF][cCdD][0-9a-fA-F]{2}:/ // IPv6 Unique Local Address
  ];

  return blockedPatterns.some(pattern => pattern.test(hostname));
}

export class HTTPHandler implements IStepHandler {
  async execute(config: any, context: ExecutionContext): Promise<StepOutput> {
    const urlString = resolvePlaceholders(config.url, context);
    if (!urlString || !urlString.startsWith('http')) {
      throw new Error('Invalid URL');
    }
    
    let parsedUrl;
    try {
      parsedUrl = new URL(urlString);
    } catch {
      throw new Error('Malformed URL');
    }

    if (isBlockedHost(parsedUrl.hostname)) {
      throw new Error('SSRF Protection: Access to this host is forbidden');
    }
    
    const method = config.method || 'GET';
    const headers = config.headers || {};
    
    let body = undefined;
    if (config.body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      const resolvedBody = resolvePlaceholders(typeof config.body === 'string' ? config.body : JSON.stringify(config.body), context);
      body = resolvedBody;
    }

    // Set a timeout to prevent resource exhaustion (e.g. 15 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(urlString, { 
        method, 
        headers, 
        body,
        signal: controller.signal as any // Node 18+ native fetch
      });
      
      clearTimeout(timeoutId);
      
      // Limit response size (e.g. 5MB)
      const contentLength = res.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
        throw new Error('Response payload too large');
      }

      let outputData;
      const text = await res.text();
      
      if (text.length > 5 * 1024 * 1024) {
        throw new Error('Response text too large');
      }

      try {
        outputData = JSON.parse(text);
      } catch {
        outputData = text;
      }
      
      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status} ${text.substring(0, 100)}`); // Don't expose massive error bodies
      }
      
      return {
        status: 'completed',
        output: { status: res.status, data: outputData }
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('HTTP Request timed out');
      }
      throw err;
    }
  }
}
