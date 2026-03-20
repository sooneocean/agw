import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';

export interface Tenant {
  id: string;
  name: string;
  apiKey: string;
  quotaDailyLimit?: number;
  quotaMonthlyLimit?: number;
  allowedAgents?: string[];
  maxConcurrency?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: Tenant;
  }
}

export class TenantManager {
  private tenants = new Map<string, Tenant>();
  private keyIndex = new Map<string, string>(); // hashedKey → tenantId

  addTenant(tenant: Tenant): void {
    this.tenants.set(tenant.id, tenant);
    const hash = createHash('sha256').update(tenant.apiKey).digest('hex');
    this.keyIndex.set(hash, tenant.id);
  }

  removeTenant(id: string): void {
    const tenant = this.tenants.get(id);
    if (tenant) {
      const hash = createHash('sha256').update(tenant.apiKey).digest('hex');
      this.keyIndex.delete(hash);
      this.tenants.delete(id);
    }
  }

  resolveByApiKey(apiKey: string): Tenant | undefined {
    const hash = createHash('sha256').update(apiKey).digest('hex');
    const tenantId = this.keyIndex.get(hash);
    return tenantId ? this.tenants.get(tenantId) : undefined;
  }

  getTenant(id: string): Tenant | undefined {
    return this.tenants.get(id);
  }

  listTenants(): Tenant[] {
    return Array.from(this.tenants.values()).map(t => ({ ...t, apiKey: '***' }));
  }
}

export function registerTenantMiddleware(app: FastifyInstance, tenantManager: TenantManager): void {
  if (tenantManager.listTenants().length === 0) return;

  app.addHook('onRequest', async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    const key = header.slice(7);
    const tenant = tenantManager.resolveByApiKey(key);
    if (tenant) request.tenant = tenant;
  });
}
