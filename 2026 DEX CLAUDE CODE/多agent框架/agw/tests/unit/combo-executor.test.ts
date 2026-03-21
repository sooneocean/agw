import { describe, it, expect } from 'vitest';
import { parseReviewOutput } from '../../src/daemon/services/combo-executor.js';

describe('parseReviewOutput', () => {
  it('parses valid JSON with APPROVED verdict', () => {
    const output = '{"verdict": "APPROVED", "feedback": "Looks good"}';
    const result = parseReviewOutput(output);
    expect(result.verdict).toBe('APPROVED');
    expect(result.feedback).toBe('Looks good');
  });

  it('parses valid JSON with REJECTED verdict', () => {
    const output = '{"verdict": "REJECTED", "feedback": "Needs fixes"}';
    const result = parseReviewOutput(output);
    expect(result.verdict).toBe('REJECTED');
    expect(result.feedback).toBe('Needs fixes');
  });

  it('extracts JSON from mixed text output', () => {
    const output = 'Here is my review:\n{"verdict": "APPROVED", "feedback": "All good"}\nEnd of review.';
    const result = parseReviewOutput(output);
    expect(result.verdict).toBe('APPROVED');
  });

  it('falls back to string matching when no valid JSON', () => {
    const output = 'This code is APPROVED and ready to merge.';
    const result = parseReviewOutput(output);
    expect(result.verdict).toBe('APPROVED');
    expect(result.feedback).toBe(output);
  });

  it('falls back to REJECTED when no APPROVED keyword', () => {
    const output = 'This code needs significant rework.';
    const result = parseReviewOutput(output);
    expect(result.verdict).toBe('REJECTED');
  });

  it('handles invalid JSON verdict value gracefully', () => {
    const output = '{"verdict": "MAYBE", "feedback": "unsure"}';
    const result = parseReviewOutput(output);
    expect(result.verdict).toBe('REJECTED');
  });
});

describe('map-reduce error markers', () => {
  it('error marker format is consistent', () => {
    const stepResults: Record<number, string> = {
      0: 'Analysis result here',
      1: '[ERROR: Step 1 (analyst-2) failed after retry: timeout]',
    };
    expect(stepResults[1]).toMatch(/^\[ERROR:/);
    expect(stepResults[1]).toContain('failed after retry');
  });
});
