export interface WordPublishedEvent {
  eventId: string;
  type: 'content.word.published';
  version: 1;
  occurredAt: string;
  word: {
    id: string;
  };
}

export interface WordDeletedEvent {
  eventId: string;
  type: 'content.word.deleted';
  version: 1;
  occurredAt: string;
  word: {
    id: string;
  };
}

export type WordLifecycleEvent = WordPublishedEvent | WordDeletedEvent;

export function parseWordLifecycleEvent(value: Buffer): WordLifecycleEvent {
  let input: unknown;
  try {
    input = JSON.parse(value.toString('utf8'));
  } catch {
    throw new Error('word event is not valid JSON');
  }
  if (!isObject(input)
    || input.version !== 1
    || !isUuid(input.eventId)
    || !isDate(input.occurredAt)
    || !isObject(input.word)
    || !isUuid(input.word.id)) {
    throw new Error('invalid word event envelope');
  }
  if (input.type === 'content.word.published') return input as unknown as WordPublishedEvent;
  if (input.type === 'content.word.deleted') return input as unknown as WordDeletedEvent;
  throw new Error('unsupported word event');
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
