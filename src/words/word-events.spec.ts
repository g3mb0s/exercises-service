import { parseWordLifecycleEvent } from './word-events';

const eventId = '11111111-1111-4111-8111-111111111111';
const wordId = '22222222-2222-4222-8222-222222222222';

describe('word lifecycle event contract', () => {
  it.each([
    {
      eventId,
      type: 'content.word.published',
      version: 1,
      occurredAt: '2026-08-20T08:00:00.000Z',
      word: { id: wordId },
    },
    {
      eventId,
      type: 'content.word.deleted',
      version: 1,
      occurredAt: '2026-08-20T08:00:00.000Z',
      word: { id: wordId },
    },
  ])('parses $type', (event) => {
    expect(parseWordLifecycleEvent(Buffer.from(JSON.stringify(event)))).toEqual(event);
  });

  it('rejects unsupported versions', () => {
    const event = {
      eventId,
      type: 'content.word.deleted',
      version: 2,
      occurredAt: '2026-08-20T08:00:00.000Z',
      word: { id: wordId },
    };
    expect(() => parseWordLifecycleEvent(Buffer.from(JSON.stringify(event)))).toThrow('invalid word event envelope');
  });

  it('rejects unsupported types', () => {
    const event = {
      eventId,
      type: 'content.word.renamed',
      version: 1,
      occurredAt: '2026-08-20T08:00:00.000Z',
      word: { id: wordId },
    };
    expect(() => parseWordLifecycleEvent(Buffer.from(JSON.stringify(event)))).toThrow('unsupported word event');
  });
});
