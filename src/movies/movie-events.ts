export interface MovieCompletedEvent {
  eventId: string;
  type: 'content.movie.processing.completed';
  version: 1;
  occurredAt: string;
  movie: {
    id: string;
    durationMs: number;
    clipsCount: number;
  };
}

export interface MovieFailedEvent {
  eventId: string;
  type: 'content.movie.processing.failed';
  version: 1;
  occurredAt: string;
  movie: {
    id: string;
    error: string;
  };
}

export interface MovieDeletedEvent {
  eventId: string;
  type: 'content.movie.deleted';
  version: 1;
  occurredAt: string;
  movie: {
    id: string;
  };
}

export type MovieLifecycleEvent = MovieCompletedEvent | MovieFailedEvent | MovieDeletedEvent;

export function parseMovieLifecycleEvent(value: Buffer): MovieLifecycleEvent {
  let input: unknown;
  try {
    input = JSON.parse(value.toString('utf8'));
  } catch {
    throw new Error('movie event is not valid JSON');
  }
  if (!isObject(input)
    || input.version !== 1
    || !isUuid(input.eventId)
    || !isDate(input.occurredAt)
    || !isObject(input.movie)
    || !isUuid(input.movie.id)) {
    throw new Error('invalid movie event envelope');
  }
  if (input.type === 'content.movie.processing.completed') {
    if (!isPositiveInteger(input.movie.durationMs) || !isNonnegativeInteger(input.movie.clipsCount)) {
      throw new Error('invalid completed movie event');
    }
    return input as unknown as MovieCompletedEvent;
  }
  if (input.type === 'content.movie.processing.failed') {
    if (typeof input.movie.error !== 'string') throw new Error('invalid failed movie event');
    return input as unknown as MovieFailedEvent;
  }
  if (input.type === 'content.movie.deleted') return input as unknown as MovieDeletedEvent;
  throw new Error('unsupported movie event');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
