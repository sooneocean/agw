import { EventEmitter } from 'node:events';

export interface StreamChunk {
  taskId: string;
  source: 'stdout' | 'stderr';
  content: string;
  timestamp: number;
  agentId?: string;
}

/**
 * Aggregates multiple task streams into a single ordered stream.
 * Useful for combos and workflows where multiple agents run and
 * the caller wants a unified stream of all output.
 */
export class StreamAggregator extends EventEmitter {
  private chunks: StreamChunk[] = [];
  private taskIds = new Set<string>();
  private completedTasks = new Set<string>();
  private static readonly MAX_CHUNKS = 10_000;

  track(taskId: string, agentId?: string): void {
    this.taskIds.add(taskId);
  }

  addChunk(taskId: string, source: 'stdout' | 'stderr', content: string, agentId?: string): void {
    const chunk: StreamChunk = {
      taskId, source, content, timestamp: Date.now(), agentId,
    };
    this.chunks.push(chunk);
    if (this.chunks.length > StreamAggregator.MAX_CHUNKS) {
      this.chunks.shift();
    }
    this.emit('chunk', chunk);
  }

  markComplete(taskId: string): void {
    this.completedTasks.add(taskId);
    if (this.isAllComplete()) {
      this.emit('complete', this.getFullOutput());
    }
  }

  isAllComplete(): boolean {
    return this.taskIds.size > 0 && this.completedTasks.size >= this.taskIds.size;
  }

  getChunks(): StreamChunk[] {
    return [...this.chunks];
  }

  getFullOutput(): string {
    return this.chunks
      .filter(c => c.source === 'stdout')
      .map(c => c.content)
      .join('');
  }

  getOutputByTask(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const chunk of this.chunks) {
      if (chunk.source === 'stdout') {
        result[chunk.taskId] = (result[chunk.taskId] ?? '') + chunk.content;
      }
    }
    return result;
  }
}
