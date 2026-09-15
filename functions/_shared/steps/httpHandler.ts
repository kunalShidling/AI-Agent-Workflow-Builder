import { ExecutionContext, IStepHandler, StepOutput, resolvePlaceholders } from '../executor/context';
import { URL } from 'url';
import * as http from 'http';
import * as https from 'https';
import * as dns from 'dns';
import { isIP } from 'net';

function isBlockedIp(ip: string): boolean {
  // Reject localhost/loopback
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.')) return true;
  // Reject IPv4 private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  // Reject IPv4 link-local / Cloud Metadata (169.254.0.0/16)
  if (/^169\.254\./.test(ip)) return true;
  // Reject IPv6 Unique Local Addresses (fc00::/7) and Link-Local (fe80::/10)
  if (/^[fF][cCdD][0-9a-fA-F]{2}:/.test(ip)) return true;
  if (/^[fF][eE][89aAbB][0-9a-fA-F]:/.test(ip)) return true;
  // Reject multicast/reserved (224.0.0.0/4, 240.0.0.0/4)
  if (/^(22[4-9]|23[0-9]|24[0-9]|25[0-5])\./.test(ip)) return true;

  return false;
}

// Custom lookup function that resolves DNS and verifies the IP address before connecting
function safeLookup(hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address as string, family);

    const ipStr = typeof address === 'string' ? address : (address as any)[0]?.address;

    if (isBlockedIp(ipStr)) {
      return callback(new Error(`SSRF Blocked: Host resolves to private/reserved IP: ${ipStr}`) as NodeJS.ErrnoException, ipStr, family);
    }

    callback(null, ipStr, family);
  });
}

const safeHttpAgent = new http.Agent({ lookup: safeLookup as any });
const safeHttpsAgent = new https.Agent({ lookup: safeLookup as any });

export class HTTPHandler implements IStepHandler {
  async execute(config: any, context: ExecutionContext): Promise<StepOutput> {
    const urlString = resolvePlaceholders(config.url, context);
    if (!urlString) throw new Error('Invalid URL');

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlString);
    } catch {
      throw new Error('Malformed URL');
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('SSRF Protection: Only http and https protocols are allowed');
    }

    if (parsedUrl.username || parsedUrl.password) {
      throw new Error('SSRF Protection: Credentials in URL are not allowed');
    }

    // Immediate check if user passed a raw IP address
    if (isIP(parsedUrl.hostname) && isBlockedIp(parsedUrl.hostname)) {
      throw new Error('SSRF Protection: Access to this private IP is forbidden');
    }

    const method = (config.method || 'GET').toUpperCase();
    const headers = config.headers || {};

    let bodyData: string | undefined = undefined;
    if (config.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      bodyData = resolvePlaceholders(typeof config.body === 'string' ? config.body : JSON.stringify(config.body), context);
    }

    return new Promise((resolve, reject) => {
      const options = {
        method,
        headers,
        agent: parsedUrl.protocol === 'https:' ? safeHttpsAgent : safeHttpAgent,
        timeout: 15000 // 15s timeout
      };

      const req = (parsedUrl.protocol === 'https:' ? https : http).request(parsedUrl, options, (res) => {

        // Handle redirects safely (restrict to 0 for simplicity, or 5 if implementing deep fetch loop, but user said "preserve redirect restrictions" implying standard protection. Node core doesn't follow redirects automatically, which is naturally safe).
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
           return reject(new Error('Redirects are not automatically followed for security reasons.'));
        }

        let totalLength = 0;
        const chunks: Buffer[] = [];
        const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit

        const contentLength = res.headers['content-length'];
        if (contentLength && parseInt(contentLength) > MAX_SIZE) {
          req.destroy();
          return reject(new Error('Response payload too large'));
        }

        res.on('data', (chunk) => {
          totalLength += chunk.length;
          if (totalLength > MAX_SIZE) {
            res.destroy();
            req.destroy();
            return reject(new Error('Response payload too large'));
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          let outputData;
          try {
            outputData = JSON.parse(text);
          } catch {
            outputData = text;
          }

          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`HTTP Error: ${res.statusCode} ${text.substring(0, 100)}`));
          }

          resolve({
            status: 'completed',
            output: { status: res.statusCode, data: outputData }
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('HTTP Request timed out'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    });
  }
}
