import { describe, it, expect } from 'vitest';
import { TenantManager } from '../../src/daemon/middleware/tenant.js';

describe('TenantManager', () => {
  it('adds and resolves tenant by API key', () => {
    const tm = new TenantManager();
    tm.addTenant({ id: 't1', name: 'Team A', apiKey: 'key-abc' });
    const tenant = tm.resolveByApiKey('key-abc');
    expect(tenant).toBeDefined();
    expect(tenant!.id).toBe('t1');
  });

  it('returns undefined for unknown key', () => {
    const tm = new TenantManager();
    expect(tm.resolveByApiKey('unknown')).toBeUndefined();
  });

  it('removes tenant', () => {
    const tm = new TenantManager();
    tm.addTenant({ id: 't1', name: 'A', apiKey: 'k1' });
    tm.removeTenant('t1');
    expect(tm.resolveByApiKey('k1')).toBeUndefined();
  });

  it('lists tenants with masked keys', () => {
    const tm = new TenantManager();
    tm.addTenant({ id: 't1', name: 'A', apiKey: 'secret' });
    const list = tm.listTenants();
    expect(list).toHaveLength(1);
    expect(list[0].apiKey).toBe('***');
  });

  it('isolates tenants', () => {
    const tm = new TenantManager();
    tm.addTenant({ id: 't1', name: 'A', apiKey: 'key1', allowedAgents: ['claude'] });
    tm.addTenant({ id: 't2', name: 'B', apiKey: 'key2', allowedAgents: ['codex'] });
    expect(tm.resolveByApiKey('key1')!.allowedAgents).toEqual(['claude']);
    expect(tm.resolveByApiKey('key2')!.allowedAgents).toEqual(['codex']);
  });
});
