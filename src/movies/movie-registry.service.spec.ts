import { PrismaService } from '../db/prisma.service';
import { MovieCompletedEvent, MovieDeletedEvent } from './movie-events';
import { MovieRegistryService } from './movie-registry.service';

const eventId = '11111111-1111-4111-8111-111111111111';
const movieId = '22222222-2222-4222-8222-222222222222';
const clipId = '33333333-3333-4333-8333-333333333333';

describe('MovieRegistryService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('synchronizes a ready movie snapshot transactionally', async () => {
    const prisma = prismaMock();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      movie: {
        id: movieId,
        title: 'Movie',
        thumbnail_url: 'https://storage.example/poster.jpg',
        duration_ms: 10_000,
        clips: [{ id: clipId, position: 0, start_ms: 0, end_ms: 10_000 }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const service = new MovieRegistryService(prisma as unknown as PrismaService);

    await expect(service.apply(completedEvent())).resolves.toBe('applied');
    expect(prisma.syncedMovie.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ id: movieId, title: 'Movie' }),
    }));
    expect(prisma.syncedMovieClip.createMany).toHaveBeenCalledWith({
      data: [{ id: clipId, movieId, position: 0, startMs: 0, endMs: 10_000 }],
    });
    expect(prisma.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId, eventType: 'content.movie.processing.completed' },
    });
  });

  it('removes a synchronized movie on deletion', async () => {
    const prisma = prismaMock();
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new MovieRegistryService(prisma as unknown as PrismaService);
    const event: MovieDeletedEvent = {
      eventId,
      type: 'content.movie.deleted',
      version: 1,
      occurredAt: '2026-07-31T08:00:00.000Z',
      movie: { id: movieId },
    };

    await expect(service.apply(event)).resolves.toBe('applied');
    expect(prisma.syncedMovie.deleteMany).toHaveBeenCalledWith({ where: { id: movieId } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function completedEvent(): MovieCompletedEvent {
  return {
    eventId,
    type: 'content.movie.processing.completed',
    version: 1,
    occurredAt: '2026-07-31T08:00:00.000Z',
    movie: { id: movieId, durationMs: 10_000, clipsCount: 1 },
  };
}

function prismaMock() {
  const processedEvent = {
    findUnique: jest.fn(async () => null),
    create: jest.fn(async () => ({})),
  };
  const syncedMovie = {
    upsert: jest.fn(async () => ({})),
    deleteMany: jest.fn(async () => ({ count: 1 })),
  };
  const syncedMovieClip = {
    deleteMany: jest.fn(async () => ({ count: 0 })),
    createMany: jest.fn(async () => ({ count: 1 })),
  };
  return {
    processedEvent,
    syncedMovie,
    syncedMovieClip,
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      processedEvent,
      syncedMovie,
      syncedMovieClip,
    })),
  };
}
