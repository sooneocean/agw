/**
 * Condition Engine — evaluates conditions on agent output to control combo flow.
 *
 * Conditions:
 *   contains:"APPROVED"     — output contains string
 *   !contains:"ERROR"       — output does NOT contain string
 *   exitCode:0              — task exit code equals value
 *   length>100              — output length greater than threshold
 *   matches:/pattern/i      — output matches regex
 *   always                  — always true (default)
 */

export interface Condition {
  type: 'contains' | 'not-contains' | 'exitCode' | 'length-gt' | 'length-lt' | 'matches' | 'always';
  value?: string | number;
}

export interface ConditionalBranch {
  condition: Condition;
  thenStep: number;  // step index to jump to
  elseStep?: number; // step index if condition is false
}

export function parseCondition(expr: string): Condition {
  if (expr === 'always') return { type: 'always' };

  const containsMatch = expr.match(/^contains:"(.+)"$/);
  if (containsMatch) return { type: 'contains', value: containsMatch[1] };

  const notContainsMatch = expr.match(/^!contains:"(.+)"$/);
  if (notContainsMatch) return { type: 'not-contains', value: notContainsMatch[1] };

  const exitCodeMatch = expr.match(/^exitCode:(\d+)$/);
  if (exitCodeMatch) return { type: 'exitCode', value: parseInt(exitCodeMatch[1], 10) };

  const lengthGtMatch = expr.match(/^length>(\d+)$/);
  if (lengthGtMatch) return { type: 'length-gt', value: parseInt(lengthGtMatch[1], 10) };

  const lengthLtMatch = expr.match(/^length<(\d+)$/);
  if (lengthLtMatch) return { type: 'length-lt', value: parseInt(lengthLtMatch[1], 10) };

  const matchesMatch = expr.match(/^matches:\/(.+)\/([gimsuy]*)$/);
  if (matchesMatch) return { type: 'matches', value: matchesMatch[1] + (matchesMatch[2] ? `/${matchesMatch[2]}` : '') };

  throw new Error(`Invalid condition: ${expr}`);
}

export function evaluateCondition(condition: Condition, output: string, exitCode: number = 0): boolean {
  switch (condition.type) {
    case 'always':
      return true;

    case 'contains':
      return output.includes(String(condition.value));

    case 'not-contains':
      return !output.includes(String(condition.value));

    case 'exitCode':
      return exitCode === condition.value;

    case 'length-gt':
      return output.length > (condition.value as number);

    case 'length-lt':
      return output.length < (condition.value as number);

    case 'matches': {
      const raw = String(condition.value);
      if (raw.length > 200) throw new Error('Regex pattern too long (max 200 chars)');
      const parts = raw.split('/');
      const pattern = parts[0];
      const flags = parts[1] ?? '';
      try {
        // Test against truncated output to limit backtracking damage
        return new RegExp(pattern, flags).test(output.slice(0, 50_000));
      } catch {
        return false;
      }
    }
  }
}
