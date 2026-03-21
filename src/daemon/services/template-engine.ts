/**
 * Task Template Engine — reusable parameterized task definitions.
 *
 * Templates use {{param.name}} syntax for user-supplied values.
 * Templates can be stored, listed, and instantiated.
 *
 * Example:
 *   { id: "code-review", prompt: "Review {{param.file}} for {{param.criteria}}", agent: "claude" }
 *   Instantiate with: { templateId: "code-review", params: { file: "auth.ts", criteria: "security" } }
 */

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;           // template with {{param.name}} placeholders
  agent?: string;           // default agent
  priority?: number;
  params: TemplateParam[];  // parameter definitions
  tags?: string[];
}

export interface TemplateParam {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface InstantiateRequest {
  templateId: string;
  params: Record<string, string>;
  overrides?: {
    agent?: string;
    priority?: number;
    workingDirectory?: string;
  };
}

export class TemplateEngine {
  private templates = new Map<string, TaskTemplate>();

  register(template: TaskTemplate): void {
    this.templates.set(template.id, template);
  }

  unregister(id: string): boolean {
    return this.templates.delete(id);
  }

  get(id: string): TaskTemplate | undefined {
    return this.templates.get(id);
  }

  list(tag?: string): TaskTemplate[] {
    const all = Array.from(this.templates.values());
    if (tag) return all.filter(t => t.tags?.includes(tag));
    return all;
  }

  instantiate(request: InstantiateRequest): { prompt: string; agent?: string; priority?: number } {
    const template = this.templates.get(request.templateId);
    if (!template) throw new Error(`Template not found: ${request.templateId}`);

    // Validate required params
    for (const param of template.params) {
      if (param.required && !(request.params[param.name] ?? param.default)) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }
    }

    // Interpolate {{param.name}} with provided values
    let prompt = template.prompt;
    for (const param of template.params) {
      const value = request.params[param.name] ?? param.default ?? '';
      const escapedName = param.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      prompt = prompt.replace(new RegExp(`\\{\\{param\\.${escapedName}\\}\\}`, 'g'), value);
    }

    return {
      prompt,
      agent: request.overrides?.agent ?? template.agent,
      priority: request.overrides?.priority ?? template.priority,
    };
  }

  /** Seed built-in templates */
  seedDefaults(): void {
    this.register({
      id: 'code-review',
      name: 'Code Review',
      description: 'Review a file for quality, security, and correctness',
      prompt: 'Review {{param.file}} for {{param.criteria}}. Focus on actionable issues.',
      agent: 'claude',
      priority: 4,
      params: [
        { name: 'file', description: 'File path to review', required: true },
        { name: 'criteria', description: 'Review criteria', required: false, default: 'quality, security, correctness' },
      ],
      tags: ['review', 'quality'],
    });

    this.register({
      id: 'implement-feature',
      name: 'Implement Feature',
      description: 'Implement a new feature with tests',
      prompt: 'Implement the following feature: {{param.description}}\n\nRequirements:\n{{param.requirements}}\n\nInclude unit tests.',
      agent: 'codex',
      priority: 3,
      params: [
        { name: 'description', description: 'Feature description', required: true },
        { name: 'requirements', description: 'Detailed requirements', required: false, default: 'Follow existing patterns' },
      ],
      tags: ['implementation', 'feature'],
    });

    this.register({
      id: 'explain-code',
      name: 'Explain Code',
      description: 'Explain what a piece of code does',
      prompt: 'Explain this code in {{param.detail_level}} detail:\n\n{{param.code}}',
      agent: 'claude',
      priority: 2,
      params: [
        { name: 'code', description: 'Code to explain', required: true },
        { name: 'detail_level', description: 'Detail level (brief/moderate/deep)', required: false, default: 'moderate' },
      ],
      tags: ['explanation', 'documentation'],
    });

    this.register({
      id: 'debug-issue',
      name: 'Debug Issue',
      description: 'Diagnose and fix a bug',
      prompt: 'Debug this issue: {{param.issue}}\n\nError message: {{param.error}}\n\nRelevant file: {{param.file}}',
      agent: 'claude',
      priority: 5,
      params: [
        { name: 'issue', description: 'Description of the issue', required: true },
        { name: 'error', description: 'Error message or stack trace', required: false, default: 'N/A' },
        { name: 'file', description: 'Relevant file path', required: false, default: 'N/A' },
      ],
      tags: ['debugging', 'fix'],
    });
  }
}
