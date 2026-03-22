import type { FastifyInstance } from 'fastify';
import type { NoteRepo } from '../../store/note-repo.js';

export function registerNoteRoutes(app: FastifyInstance, noteRepo: NoteRepo): void {
  app.get<{ Params: { id: string } }>('/tasks/:id/notes', async (request) => {
    return noteRepo.getByTaskId(request.params.id);
  });

  app.post<{ Params: { id: string }; Body: { content: string } }>('/tasks/:id/notes', {
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 10000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const note = noteRepo.add(request.params.id, request.body.content);
    return reply.status(201).send(note);
  });

  app.delete<{ Params: { noteId: string } }>('/notes/:noteId', async (request, reply) => {
    const deleted = noteRepo.delete(parseInt(request.params.noteId, 10));
    if (!deleted) return reply.status(404).send({ error: 'Note not found' });
    return { deleted: true };
  });
}
