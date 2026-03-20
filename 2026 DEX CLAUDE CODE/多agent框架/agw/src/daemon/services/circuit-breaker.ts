type State = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold: number;  // failures before opening
  resetTimeout: number;      // ms before trying half-open
  maxRetries: number;        // retries per execution
  retryDelay: number;        // ms between retries
}

const DEFAULTS: CircuitBreakerOptions = {
  failureThreshold: 3,
  resetTimeout: 30_000,
  maxRetries: 2,
  retryDelay: 1_000,
};

export class CircuitBreaker {
  private state: State = 'closed';
  private failures = 0;
  private lastFailure = 0;
  private options: CircuitBreakerOptions;

  constructor(public readonly name: string, options?: Partial<CircuitBreakerOptions>) {
    this.options = { ...DEFAULTS, ...options };
  }

  getState(): State { return this.state; }
  getFailures(): number { return this.failures; }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure >= this.options.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error(`Circuit breaker [${this.name}] is OPEN — agent temporarily unavailable`);
      }
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        const result = await fn();
        this.onSuccess();
        return result;
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.options.maxRetries) {
          await new Promise(r => setTimeout(r, this.options.retryDelay * (attempt + 1)));
        }
      }
    }

    this.onFailure();
    throw lastError!;
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.options.failureThreshold) {
      this.state = 'open';
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
  }

  toJSON() {
    return { name: this.name, state: this.state, failures: this.failures };
  }
}

export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  getOrCreate(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    let cb = this.breakers.get(name);
    if (!cb) {
      cb = new CircuitBreaker(name, options);
      this.breakers.set(name, cb);
    }
    return cb;
  }

  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }
}
