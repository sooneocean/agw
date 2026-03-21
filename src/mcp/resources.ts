export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export function getResourceDefinitions(): ResourceDefinition[] {
  return [
    {
      uri: 'agw://agents',
      name: 'AGW Agents',
      description: 'Agent list with health status',
      mimeType: 'application/json',
    },
    {
      uri: 'agw://stats',
      name: 'AGW Stats',
      description: 'System statistics',
      mimeType: 'application/json',
    },
  ];
}

export async function handleResource(uri: string): Promise<string> {
  const baseUrl = process.env.AGW_URL ?? 'http://127.0.0.1:4927';
  const token = process.env.AGW_AUTH_TOKEN;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  switch (uri) {
    case 'agw://agents': {
      const res = await fetch(`${baseUrl}/agents`, { headers });
      if (!res.ok) throw new Error(`GET /agents failed: ${res.status}`);
      const data = await res.json();
      return JSON.stringify(data);
    }

    case 'agw://stats': {
      const [stats, ranking, costs] = await Promise.all([
        fetch(`${baseUrl}/tasks/stats`, { headers }).then((r) => {
          if (!r.ok) throw new Error(`GET /tasks/stats failed: ${r.status}`);
          return r.json();
        }),
        fetch(`${baseUrl}/agents/ranking`, { headers }).then((r) => {
          if (!r.ok) throw new Error(`GET /agents/ranking failed: ${r.status}`);
          return r.json();
        }),
        fetch(`${baseUrl}/costs`, { headers }).then((r) => {
          if (!r.ok) throw new Error(`GET /costs failed: ${r.status}`);
          return r.json();
        }),
      ]);
      return JSON.stringify({ stats, ranking, costs });
    }

    default:
      throw new Error(`Unknown resource URI: ${uri}`);
  }
}
