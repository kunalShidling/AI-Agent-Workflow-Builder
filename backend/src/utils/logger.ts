export const logger = {
  info: (msg: string, meta?: any) => {
    // Do not log API keys or sensitive secrets
    const safeMeta = { ...meta };
    if (safeMeta.headers && safeMeta.headers['Authorization']) {
      safeMeta.headers['Authorization'] = 'REDACTED';
    }
    console.log(JSON.stringify({ level: 'INFO', msg, ...safeMeta }));
  },
  error: (msg: string, meta?: any) => {
    console.error(JSON.stringify({ level: 'ERROR', msg, ...meta }));
  }
};
