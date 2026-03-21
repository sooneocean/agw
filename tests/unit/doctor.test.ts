import { describe, it, expect } from 'vitest';

describe('Doctor command', () => {
  it('module loads without error', async () => {
    const mod = await import('../../src/cli/commands/doctor.js');
    expect(mod.registerDoctorCommand).toBeDefined();
    expect(typeof mod.registerDoctorCommand).toBe('function');
  });
});
