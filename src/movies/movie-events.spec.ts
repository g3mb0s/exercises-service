import { parseMovieLifecycleEvent } from './movie-events';

const eventId = '11111111-1111-4111-8111-111111111111';
const movieId = '22222222-2222-4222-8222-222222222222';

describe('movie lifecycle event contract', () => {
  it.each([
    {
      eventId,
      type: 'content.movie.processing.completed',
      version: 1,
      occurredAt: '2026-07-31T08:00:00.000Z',
      movie: { id: movieId, durationMs: 10_000, clipsCount: 2 },
    },
    {
      eventId,
      type: 'content.movie.deleted',
      version: 1,
      occurredAt: '2026-07-31T08:00:00.000Z',
      movie: { id: movieId },
    },
  ])('parses $type', (event) => {
    expect(parseMovieLifecycleEvent(Buffer.from(JSON.stringify(event)))).toEqual(event);
  });

  it('rejects unsupported versions', () => {
    const event = {
      eventId,
      type: 'content.movie.deleted',
      version: 2,
      occurredAt: '2026-07-31T08:00:00.000Z',
      movie: { id: movieId },
    };
    expect(() => parseMovieLifecycleEvent(Buffer.from(JSON.stringify(event)))).toThrow('invalid movie event envelope');
  });
});
