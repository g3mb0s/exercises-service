import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getConfig } from '../config';
import { PrismaService } from '../db/prisma.service';
import { WordLifecycleEvent } from './word-events';

interface WordSnapshot {
  id: string;
  word: string;
  translation: string;
  transcription: string | null;
  examples: Record<string, string>[];
  categories: Array<{
    slug: string;
    nameRu: string | null;
    nameEn: string | null;
  }>;
}

@Injectable()
export class WordRegistryService {
  private readonly contentServiceUrl = getConfig().contentServiceUrl;

  constructor(private readonly prisma: PrismaService) {}

  async apply(event: WordLifecycleEvent): Promise<'applied' | 'duplicate'> {
    if (await this.prisma.processedEvent.findUnique({ where: { eventId: event.eventId } })) {
      return 'duplicate';
    }
    if (event.type !== 'content.word.published') {
      return this.remove(event);
    }

    const word = await this.fetchWord(event.word.id);
    return this.prisma.$transaction(async (tx) => {
      if (await tx.processedEvent.findUnique({ where: { eventId: event.eventId } })) return 'duplicate';
      if (!word) {
        await tx.syncedWord.deleteMany({ where: { id: event.word.id } });
        await tx.srsCard.deleteMany({
          where: { subjectType: 'word', subjectId: event.word.id },
        });
      } else {
        await tx.syncedWord.upsert({
          where: { id: word.id },
          create: {
            id: word.id,
            word: word.word,
            translation: word.translation,
            transcription: word.transcription,
            examples: word.examples as unknown as Prisma.InputJsonValue,
            categories: word.categories.map((category) => category.slug),
          },
          update: {
            word: word.word,
            translation: word.translation,
            transcription: word.transcription,
            examples: word.examples as unknown as Prisma.InputJsonValue,
            categories: word.categories.map((category) => category.slug),
            syncedAt: new Date(),
          },
        });
        for (const category of word.categories) {
          await tx.syncedWordCategory.upsert({
            where: { slug: category.slug },
            create: {
              slug: category.slug,
              nameRu: category.nameRu,
              nameEn: category.nameEn,
            },
            update: {
              nameRu: category.nameRu,
              nameEn: category.nameEn,
            },
          });
        }
      }
      await tx.processedEvent.create({ data: { eventId: event.eventId, eventType: event.type } });
      return 'applied';
    });
  }

  private async remove(event: Exclude<WordLifecycleEvent, { type: 'content.word.published' }>) {
    return this.prisma.$transaction(async (tx) => {
      if (await tx.processedEvent.findUnique({ where: { eventId: event.eventId } })) return 'duplicate';
      await tx.syncedWord.deleteMany({ where: { id: event.word.id } });
      await tx.srsCard.deleteMany({
        where: { subjectType: 'word', subjectId: event.word.id },
      });
      await tx.processedEvent.create({ data: { eventId: event.eventId, eventType: event.type } });
      return 'applied';
    });
  }

  private async fetchWord(wordId: string): Promise<WordSnapshot | null> {
    let response: Response;
    try {
      response = await fetch(`${this.contentServiceUrl}/words/${wordId}`);
    } catch {
      throw new ServiceUnavailableException('Content service is unavailable for word synchronization');
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new ServiceUnavailableException(`Word synchronization failed with status ${response.status}`);
    }
    const payload = await response.json() as { word?: unknown };
    return parseWordSnapshot(payload.word, wordId);
  }
}

function parseWordSnapshot(input: unknown, expectedId: string): WordSnapshot {
  if (!isObject(input)
    || input.id !== expectedId
    || typeof input.word !== 'string'
    || !input.word.trim()
    || typeof input.translation !== 'string'
    || !input.translation.trim()
    || (input.transcription !== null && typeof input.transcription !== 'string')
    || !Array.isArray(input.examples)
    || !Array.isArray(input.categories)) {
    throw new ServiceUnavailableException('Content service returned an invalid word snapshot');
  }
  const examples = input.examples.map((example, index) => {
    if (!isObject(example)
      || (example.en !== undefined && typeof example.en !== 'string')
      || (example.ru !== undefined && typeof example.ru !== 'string')) {
      throw new ServiceUnavailableException('Content service returned invalid word examples');
    }
    return example as Record<string, string>;
  });
  const categories = input.categories.map((category) => {
    if (!isObject(category)
      || typeof category.slug !== 'string'
      || !category.slug.trim()
      || (category.name_ru !== null && typeof category.name_ru !== 'string')
      || (category.name_en !== null && typeof category.name_en !== 'string')) {
      throw new ServiceUnavailableException('Content service returned invalid word categories');
    }
    return {
      slug: category.slug.trim(),
      nameRu: category.name_ru,
      nameEn: category.name_en,
    };
  });
  return {
    id: input.id,
    word: input.word.trim(),
    translation: input.translation.trim(),
    transcription: input.transcription,
    examples,
    categories,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
