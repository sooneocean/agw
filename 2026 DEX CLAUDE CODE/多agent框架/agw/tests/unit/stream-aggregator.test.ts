import { describe, it, expect } from 'vitest';
import { StreamAggregator } from '../../src/daemon/services/stream-aggregator.js';

describe('StreamAggregator', () => {
  it('tracks chunks from multiple tasks', () => {
    const sa = new StreamAggregator();
    sa.track('t1'); sa.track('t2');
    sa.addChunk('t1', 'stdout', 'hello ');
    sa.addChunk('t2', 'stdout', 'world ');
    sa.addChunk('t1', 'stdout', 'from t1');
    expect(sa.getChunks()).toHaveLength(3);
  });

  it('produces full output in order', () => {
    const sa = new StreamAggregator();
    sa.track('t1');
    sa.addChunk('t1', 'stdout', 'line1\n');
    sa.addChunk('t1', 'stderr', 'err');
    sa.addChunk('t1', 'stdout', 'line2');
    expect(sa.getFullOutput()).toBe('line1\nline2');
  });

  it('groups output by task', () => {
    const sa = new StreamAggregator();
    sa.track('t1'); sa.track('t2');
    sa.addChunk('t1', 'stdout', 'A');
    sa.addChunk('t2', 'stdout', 'B');
    sa.addChunk('t1', 'stdout', 'C');
    const byTask = sa.getOutputByTask();
    expect(byTask.t1).toBe('AC');
    expect(byTask.t2).toBe('B');
  });

  it('emits complete when all tasks done', () => {
    const sa = new StreamAggregator();
    sa.track('t1'); sa.track('t2');
    let completed = false;
    sa.on('complete', () => { completed = true; });

    sa.addChunk('t1', 'stdout', 'x');
    sa.markComplete('t1');
    expect(completed).toBe(false);

    sa.markComplete('t2');
    expect(completed).toBe(true);
  });

  it('emits chunk events', () => {
    const sa = new StreamAggregator();
    const received: string[] = [];
    sa.on('chunk', (c) => received.push(c.content));
    sa.addChunk('t1', 'stdout', 'hello');
    sa.addChunk('t1', 'stdout', 'world');
    expect(received).toEqual(['hello', 'world']);
  });
});
