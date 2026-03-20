import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../src/store/db.js';
import { MemoryRepo } from '../../src/store/memory-repo.js';

describe('MemoryRepo', () => {
  let repo: MemoryRepo;

  beforeEach(() => {
    const db = createDatabase(':memory:');
    repo = new MemoryRepo(db);
  });

  it('sets and gets a value', () => {
    repo.set('key1', 'value1');
    expect(repo.get('key1')).toBe('value1');
  });

  it('upserts on conflict', () => {
    repo.set('key1', 'v1');
    repo.set('key1', 'v2');
    expect(repo.get('key1')).toBe('v2');
  });

  it('returns undefined for missing key', () => {
    expect(repo.get('nope')).toBeUndefined();
  });

  it('deletes a key', () => {
    repo.set('key1', 'v1');
    expect(repo.delete('key1')).toBe(true);
    expect(repo.get('key1')).toBeUndefined();
    expect(repo.delete('key1')).toBe(false);
  });

  it('lists by scope', () => {
    repo.set('a', '1', 'project-x');
    repo.set('b', '2', 'project-x');
    repo.set('c', '3', 'global');
    expect(repo.getByScope('project-x')).toHaveLength(2);
  });

  it('searches by key or value', () => {
    repo.set('db-host', 'localhost');
    repo.set('api-key', 'secret');
    const results = repo.search('host');
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('db-host');
  });
});
