import type { ComboPreset } from '../../types.js';

// Built-in presets
export const COMBO_PRESETS: ComboPreset[] = [
  {
    id: 'analyze-implement-review',
    name: 'Analyze → Implement → Review',
    description: 'Claude analyzes the problem, Codex implements, Claude reviews the result',
    pattern: 'pipeline',
    steps: [
      { agent: 'claude', role: 'analyzer', prompt: 'Analyze this task and produce a clear technical plan:\n\n{{input}}' },
      { agent: 'codex', role: 'implementer', prompt: 'Implement the following plan:\n\n{{prev}}' },
      { agent: 'claude', role: 'reviewer', prompt: 'Review this implementation for correctness, security, and quality. The original request was:\n\n{{input}}\n\nThe implementation output:\n\n{{prev}}' },
    ],
  },
  {
    id: 'multi-perspective',
    name: 'Multi-Perspective Analysis',
    description: 'All agents analyze independently, Claude synthesizes',
    pattern: 'map-reduce',
    steps: [
      { agent: 'claude', role: 'analyst-1', prompt: 'Analyze this from an architecture and security perspective:\n\n{{input}}' },
      { agent: 'codex', role: 'analyst-2', prompt: 'Analyze this from an implementation and performance perspective:\n\n{{input}}' },
      { agent: 'claude', role: 'synthesizer', prompt: 'Synthesize these independent analyses into a unified recommendation:\n\nAnalysis 1 (Architecture/Security):\n{{step.0}}\n\nAnalysis 2 (Implementation/Performance):\n{{step.1}}\n\nOriginal question:\n{{input}}' },
    ],
  },
  {
    id: 'code-review-loop',
    name: 'Implement + Review Loop',
    description: 'Codex implements, Claude reviews, iterates until approved',
    pattern: 'review-loop',
    steps: [
      { agent: 'codex', role: 'implementer', prompt: '{{input}}\n\n{{prev}}' },
      { agent: 'claude', role: 'reviewer', prompt: 'Review this code for correctness, security, and quality.\n\nOriginal request: {{input}}\n\nImplementation:\n{{prev}}\n\nReply with JSON: {"verdict": "APPROVED" or "REJECTED", "feedback": "your review comments"}' },
    ],
    maxIterations: 3,
  },
  {
    id: 'debate',
    name: 'Agent Debate',
    description: 'Two agents debate, then a judge synthesizes the best answer',
    pattern: 'debate',
    steps: [
      { agent: 'claude', role: 'debater-1', prompt: 'Take a strong position on this topic and argue for it:\n\n{{input}}' },
      { agent: 'codex', role: 'debater-2', prompt: 'Take the opposite position from this argument and counter it:\n\nOriginal topic: {{input}}\n\nFirst position:\n{{step.0}}' },
      { agent: 'claude', role: 'judge', prompt: 'You are a neutral judge. Evaluate both positions and synthesize the strongest answer:\n\nOriginal question: {{input}}\n\nPosition A:\n{{step.0}}\n\nPosition B:\n{{step.1}}' },
    ],
  },
];
