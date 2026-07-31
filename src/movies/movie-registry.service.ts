import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getConfig } from '../config';
import { PrismaService } from '../db/prisma.service';
import { MovieLifecycleEvent } from './movie-events';

interface MovieSnapshot {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  durationMs: number | null;
  clips: Array<{
    id: string;
    position: number;
    startMs: number;
    endMs: number;
  }>;
}

@Injectable()
export class MovieRegistryService {
  private readonly contentServiceUrl = getConfig().contentServiceUrl;

  constructor(private readonly prisma: PrismaService) {}

  async apply(event: MovieLifecycleEvent): Promise<'applied' | 'duplicate'> {
    if (await this.prisma.processedEvent.findUnique({ where: { eventId: event.eventId } })) {
      return 'duplicate';
    }
    if (event.type !== 'content.movie.processing.completed') {
      return this.remove(event);
    }

    const movie = await this.fetchMovie(event.movie.id);
    return this.prisma.$transaction(async (tx) => {
      if (await tx.processedEvent.findUnique({ where: { eventId: event.eventId } })) return 'duplicate';
      if (!movie) {
        await tx.syncedMovie.deleteMany({ where: { id: event.movie.id } });
      } else {
        await tx.syncedMovie.upsert({
          where: { id: movie.id },
          create: {
            id: movie.id,
            title: movie.title,
            thumbnailUrl: movie.thumbnailUrl,
            durationMs: movie.durationMs,
          },
          update: {
            title: movie.title,
            thumbnailUrl: movie.thumbnailUrl,
            durationMs: movie.durationMs,
            syncedAt: new Date(),
          },
        });
        await tx.syncedMovieClip.deleteMany({ where: { movieId: movie.id } });
        if (movie.clips.length) {
          await tx.syncedMovieClip.createMany({
            data: movie.clips.map((clip) => ({ ...clip, movieId: movie.id })),
          });
        }
      }
      await tx.processedEvent.create({ data: { eventId: event.eventId, eventType: event.type } });
      return 'applied';
    });
  }

  private async remove(event: Exclude<MovieLifecycleEvent, { type: 'content.movie.processing.completed' }>) {
    return this.prisma.$transaction(async (tx) => {
      if (await tx.processedEvent.findUnique({ where: { eventId: event.eventId } })) return 'duplicate';
      await tx.syncedMovie.deleteMany({ where: { id: event.movie.id } });
      await tx.processedEvent.create({ data: { eventId: event.eventId, eventType: event.type } });
      return 'applied';
    });
  }

  private async fetchMovie(movieId: string): Promise<MovieSnapshot | null> {
    let response: Response;
    try {
      response = await fetch(`${this.contentServiceUrl}/movies/${movieId}`);
    } catch {
      throw new ServiceUnavailableException('Content service is unavailable for movie synchronization');
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new ServiceUnavailableException(`Movie synchronization failed with status ${response.status}`);
    }
    const payload = await response.json() as { movie?: unknown };
    return parseMovieSnapshot(payload.movie, movieId);
  }
}

function parseMovieSnapshot(input: unknown, expectedId: string): MovieSnapshot {
  if (!isObject(input)
    || input.id !== expectedId
    || typeof input.title !== 'string'
    || !input.title.trim()
    || (input.thumbnail_url !== null && typeof input.thumbnail_url !== 'string')
    || (input.duration_ms !== null && !isPositiveInteger(input.duration_ms))
    || !Array.isArray(input.clips)) {
    throw new ServiceUnavailableException('Content service returned an invalid movie snapshot');
  }
  const clips = input.clips.map((clip) => {
    if (!isObject(clip)
      || !isUuid(clip.id)
      || !isNonnegativeInteger(clip.position)
      || !isNonnegativeInteger(clip.start_ms)
      || !isPositiveInteger(clip.end_ms)
      || clip.end_ms <= clip.start_ms) {
      throw new ServiceUnavailableException('Content service returned invalid movie clips');
    }
    return {
      id: clip.id,
      position: clip.position,
      startMs: clip.start_ms,
      endMs: clip.end_ms,
    };
  });
  return {
    id: input.id,
    title: input.title.trim(),
    thumbnailUrl: input.thumbnail_url,
    durationMs: input.duration_ms,
    clips,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
