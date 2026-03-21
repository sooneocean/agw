import { describe, it, expect } from 'vitest';
import { PriorityHeap } from '../../src/daemon/services/priority-heap.js';

describe('PriorityHeap', () => {
  const maxFirst = (a: number, b: number) => b - a;

  it('push and pop returns items in priority order', () => {
    const heap = new PriorityHeap(maxFirst);
    heap.push(3); heap.push(1); heap.push(5); heap.push(2);
    expect(heap.pop()).toBe(5);
    expect(heap.pop()).toBe(3);
    expect(heap.pop()).toBe(2);
    expect(heap.pop()).toBe(1);
    expect(heap.pop()).toBeUndefined();
  });

  it('peek returns highest without removing', () => {
    const heap = new PriorityHeap(maxFirst);
    heap.push(10); heap.push(20);
    expect(heap.peek()).toBe(20);
    expect(heap.size).toBe(2);
  });

  it('remove finds and removes matching item', () => {
    const heap = new PriorityHeap(maxFirst);
    heap.push(1); heap.push(2); heap.push(3);
    const removed = heap.remove(x => x === 2);
    expect(removed).toBe(2);
    expect(heap.size).toBe(2);
    expect(heap.pop()).toBe(3);
    expect(heap.pop()).toBe(1);
  });

  it('remove returns undefined if not found', () => {
    const heap = new PriorityHeap(maxFirst);
    heap.push(1);
    expect(heap.remove(x => x === 99)).toBeUndefined();
  });

  it('filter returns matching items without modifying heap', () => {
    const heap = new PriorityHeap(maxFirst);
    heap.push(1); heap.push(2); heap.push(3);
    const evens = heap.filter(x => x % 2 === 0);
    expect(evens).toEqual([2]);
    expect(heap.size).toBe(3);
  });

  it('handles task-like objects with priority', () => {
    const heap = new PriorityHeap<{ id: string; priority: number }>(
      (a, b) => b.priority - a.priority
    );
    heap.push({ id: 'low', priority: 1 });
    heap.push({ id: 'high', priority: 5 });
    heap.push({ id: 'mid', priority: 3 });
    expect(heap.pop()!.id).toBe('high');
    expect(heap.pop()!.id).toBe('mid');
    expect(heap.pop()!.id).toBe('low');
  });
});
