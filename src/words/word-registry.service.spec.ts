import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';
import { WordDeletedEvent, WordPublishedEvent } from './word-events';
import { WordRegistryService } from './word-registry.service';

const eventId = '11111111-1111-4111-8111-111111111111';
const wordId = '22222222-2222-4222-8222-222222222222';

describe('WordRegistryService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('synchronizes a published word snapshot transactionally', async () => {
    const prisma = prismaMock();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      word: {
        id: wordId,
        word: 'go',
        translation: 'идти',
        transcription: 'ɡəʊ',
        examples: [{ en: 'Go away.', ru: 'Уходи.' }],
        categories: [{ slug: 'verbs', name_ru: 'Глаголы', name_en: 'Verbs' }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const service = new WordRegistryService(prisma as unknown as PrismaService);

    await expect(service.apply(publishedEvent())).resolves.toBe('applied');
    expect(prisma.syncedWord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ id: wordId, word: 'go', categories: ['verbs'] }),
    }));
    expect(prisma.syncedWordCategory.upsert).toHaveBeenCalledWith({
      where: { slug: 'verbs' },
      create: { slug: 'verbs', nameRu: 'Глаголы', nameEn: 'Verbs' },
      update: { nameRu: 'Глаголы', nameEn: 'Verbs' },
    });
    expect(prisma.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId, eventType: 'content.word.published' },
    });
  });

  it('removes a word and its srs cards on deletion', async () => {
    const prisma = prismaMock();
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new WordRegistryService(prisma as unknown as PrismaService);
    const event: WordDeletedEvent = {
      eventId,
      type: 'content.word.deleted',
      version: 1,
      occurredAt: '2026-08-20T08:00:00.000Z',
      word: { id: wordId },
    };

    await expect(service.apply(event)).resolves.toBe('applied');
    expect(prisma.syncedWord.deleteMany).toHaveBeenCalledWith({ where: { id: wordId } });
    expect(prisma.srsCard.deleteMany).toHaveBeenCalledWith({
      where: { subjectType: 'word', subjectId: wordId },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is idempotent for a repeated eventId', async () => {
    const prisma = prismaMock();
    const fetchSpy = jest.spyOn(global, 'fetch');
    prisma.processedEvent.findUnique.mockResolvedValue({ eventId });
    const service = new WordRegistryService(prisma as unknown as PrismaService);

    await expect(service.apply(publishedEvent())).resolves.toBe('duplicate');
    expect(prisma.syncedWord.upsert).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('deletes the local word and its srs cards when content service reports 404', async () => {
    const prisma = prismaMock();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    const service = new WordRegistryService(prisma as unknown as PrismaService);

    await expect(service.apply(publishedEvent())).resolves.toBe('applied');
    expect(prisma.syncedWord.deleteMany).toHaveBeenCalledWith({ where: { id: wordId } });
    expect(prisma.srsCard.deleteMany).toHaveBeenCalledWith({
      where: { subjectType: 'word', subjectId: wordId },
    });
  });

  it('throws ServiceUnavailableException when the fetch is not ok', async () => {
    const prisma = prismaMock();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    const service = new WordRegistryService(prisma as unknown as PrismaService);

    await expect(service.apply(publishedEvent())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

function publishedEvent(): WordPublishedEvent {
  return {
    eventId,
    type: 'content.word.published',
    version: 1,
    occurredAt: '2026-08-20T08:00:00.000Z',
    word: { id: wordId },
  };
}

function prismaMock() {
  const processedEvent = {
    findUnique: jest.fn(),
    create: jest.fn(async () => ({})),
  };
  const syncedWord = {
    upsert: jest.fn(async () => ({})),
    deleteMany: jest.fn(async () => ({ count: 1 })),
  };
  const syncedWordCategory = {
    upsert: jest.fn(async () => ({})),
  };
  const srsCard = {
    deleteMany: jest.fn(async () => ({ count: 0 })),
  };
  return {
    processedEvent,
    syncedWord,
    syncedWordCategory,
    srsCard,
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      processedEvent,
      syncedWord,
      syncedWordCategory,
      srsCard,
    })),
  };
}
