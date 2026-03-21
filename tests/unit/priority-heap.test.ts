import { describe, it, expect } from 'vitest';
import { PriorityHeap } from '../../src/daemon/services/priority-heap.js';

describe('PriorityHeap', () => {
  function createMinHeap() {
    return new PriorityHeap<number>((a, b) => a - b);
  }

  it('starts empty', () => {
    const heap = createMinHeap();
    expect(heap.size).toBe(0);
    expect(heap.peek()).toBeUndefined();
    expect(heap.pop()).toBeUndefined();
  });

  it('push and peek returns the smallest element', () => {
    const heap = createMinHeap();
    heap.push(5);
    heap.push(3);
    heap.push(7);
    expect(heap.peek()).toBe(3);
    expect(heap.size).toBe(3);
  });

  it('pop extracts elements in sorted order', () => {
    const heap = createMinHeap();
    heap.push(10);
    heap.push(4);
    heap.push(15);
    heap.push(1);
    heap.push(7);

    const results: number[] = [];
    while (heap.size > 0) {
      results.push(heap.pop()!);
    }
    expect(results).toEqual([1, 4, 7, 10, 15]);
  });

  it('works as max-heap with reversed comparator', () => {
    const heap = new PriorityHeap<number>((a, b) => b - a);
    heap.push(3);
    heap.push(9);
    heap.push(1);
    expect(heap.pop()).toBe(9);
    expect(heap.pop()).toBe(3);
    expect(heap.pop()).toBe(1);
  });

  it('remove finds and removes an element by predicate', () => {
    const heap = createMinHeap();
    heap.push(2);
    heap.push(5);
    heap.push(8);

    const removed = heap.remove(x => x === 5);
    expect(removed).toBe(5);
    expect(heap.size).toBe(2);

    const results: number[] = [];
    while (heap.size > 0) results.push(heap.pop()!);
    expect(results).toEqual([2, 8]);
  });

  it('remove returns undefined when element not found', () => {
    const heap = createMinHeap();
    heap.push(1);
    expect(heap.remove(x => x === 99)).toBeUndefined();
    expect(heap.size).toBe(1);
  });

  it('filter returns matching elements without modifying heap', () => {
    const heap = createMinHeap();
    heap.push(1);
    heap.push(2);
    heap.push(3);
    heap.push(4);

    const evens = heap.filter(x => x % 2 === 0);
    expect(evens).toEqual(expect.arrayContaining([2, 4]));
    expect(evens.length).toBe(2);
    expect(heap.size).toBe(4);
  });

  it('handles single element correctly', () => {
    const heap = createMinHeap();
    heap.push(42);
    expect(heap.peek()).toBe(42);
    expect(heap.pop()).toBe(42);
    expect(heap.size).toBe(0);
  });

  it('handles objects with custom comparator', () => {
    const heap = new PriorityHeap<{ priority: number; name: string }>(
      (a, b) => a.priority - b.priority
    );
    heap.push({ priority: 3, name: 'low' });
    heap.push({ priority: 1, name: 'high' });
    heap.push({ priority: 2, name: 'mid' });

    expect(heap.pop()!.name).toBe('high');
    expect(heap.pop()!.name).toBe('mid');
    expect(heap.pop()!.name).toBe('low');
  });
});
