import pino from 'pino';

export const logger = pino({
  level: process.env.AGW_LOG_LEVEL || 'info',
});

export function createLogger(module: string) {
  return logger.child({ module });
}
