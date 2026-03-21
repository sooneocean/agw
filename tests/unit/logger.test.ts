import { describe, it, expect } from 'vitest';
import { createLogger } from '../../src/logger.js';

describe('Logger', () => {
  it('creates a child logger with module name', () => {
    const log = createLogger('test-module');
    expect(log).toBeDefined();
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('different modules create different loggers', () => {
    const log1 = createLogger('module-a');
    const log2 = createLogger('module-b');
    expect(log1).not.toBe(log2);
  });
});
