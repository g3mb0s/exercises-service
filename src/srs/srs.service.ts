import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../db/prisma.service';
import { WORD_INTERVALS_MS } from './intervals';

const INTERVALS_BY_SUBJECT: Record<string, number[]> = {
  word: WORD_INTERVALS_MS,
};
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

@Injectable()
export class SrsService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string, subjectType: string, subjectId: string) {
    const now = new Date();
    const card = await this.prisma.srsCard.upsert({
      where: uniqueCard(userId, subjectType, subjectId),
      create: {
        userId,
        subjectType,
        subjectId,
        status: 'learning',
        stage: 0,
        reviewCount: 0,
        errorCount: 0,
        lastAnswerWrong: false,
        nextReviewAt: now,
        startedAt: now,
      },
      update: {
        status: 'learning',
        stage: 0,
        reviewCount: 0,
        errorCount: 0,
        lastAnswerWrong: false,
        nextReviewAt: now,
      },
    });
    return { card: toCardResponse(card) };
  }

  async answer(userId: string, subjectType: string, subjectId: string, remembered: boolean) {
    const now = new Date();
    const current = await this.prisma.srsCard.findUnique({
      where: uniqueCard(userId, subjectType, subjectId),
    });
    if (!current) throw new NotFoundException('SRS card not found');

    const next = nextCardState(current, remembered, now, intervalsFor(subjectType));
    const card = await this.prisma.srsCard.update({
      where: { id: current.id },
      data: next,
    });
    return { card: toCardResponse(card) };
  }

  async markKnown(userId: string, subjectType: string, subjectId: string) {
    const card = await this.prisma.srsCard.upsert({
      where: uniqueCard(userId, subjectType, subjectId),
      create: {
        userId,
        subjectType,
        subjectId,
        status: 'known',
        stage: 0,
        reviewCount: 0,
        errorCount: 0,
        lastAnswerWrong: false,
        nextReviewAt: null,
      },
      update: {
        status: 'known',
        nextReviewAt: null,
      },
    });
    return { card: toCardResponse(card) };
  }

  async getNew(userId: string, limitInput?: string) {
    const limit = parseLimit(limitInput);
    const preferences = await this.prisma.wordLearningPreference.findUnique({ where: { userId } });
    const categorySlugs = preferences?.categorySlugs ?? [];
    if (categorySlugs.length === 0) return { items: [] };

    const existingCards = await this.prisma.srsCard.findMany({
      where: { userId, subjectType: 'word' },
      select: { subjectId: true },
    });
    const existingIds = existingCards.map((card) => card.subjectId);

    const words = await this.prisma.$queryRaw<
      Array<{
        id: string;
        word: string;
        translation: string;
        transcription: string | null;
        examples: unknown;
        categories: string[];
      }>
    >`
      SELECT id, word, translation, transcription, examples, categories
      FROM synced_words
      WHERE categories && ARRAY[${Prisma.join(categorySlugs)}]::text[]
        ${existingIds.length > 0 ? Prisma.sql`AND id::text NOT IN (${Prisma.join(existingIds)})` : Prisma.empty}
      ORDER BY random()
      LIMIT ${limit}
    `;
    return {
      items: words.map((word) => ({
        ...toWordContent(word),
        card: newCardState(),
      })),
    };
  }

  async getDue(userId: string, subjectType: string, limitInput?: string) {
    const limit = parseLimit(limitInput);
    const now = new Date();
    const cards = await this.prisma.srsCard.findMany({
      where: {
        userId,
        subjectType,
        status: 'learning',
        nextReviewAt: { lte: now },
      },
      orderBy: { nextReviewAt: 'asc' },
      take: limit,
    });
    if (cards.length === 0) return { items: [] };

    if (subjectType !== 'word') {
      return { items: cards.map((card) => ({ card: toCardResponse(card), content: null })) };
    }
    const words = await this.prisma.syncedWord.findMany({
      where: { id: { in: cards.map((card) => card.subjectId) } },
    });
    const wordById = new Map(words.map((word) => [word.id, word]));
    return {
      items: cards
        .filter((card) => wordById.has(card.subjectId))
        .map((card) => ({
          ...toWordContent(wordById.get(card.subjectId)!),
          card: toCardResponse(card),
        })),
    };
  }

  async getStats(userId: string) {
    const preferences = await this.prisma.wordLearningPreference.findUnique({ where: { userId } });
    const categorySlugs = preferences?.categorySlugs ?? [];

    const [statusRows, errorCount, existingCards] = await Promise.all([
      this.prisma.srsCard.groupBy({
        by: ['status'],
        where: { userId, subjectType: 'word' },
        _count: { _all: true },
      }),
      this.prisma.srsCard.count({
        where: { userId, subjectType: 'word', errorCount: { gt: 0 } },
      }),
      this.prisma.srsCard.findMany({
        where: { userId, subjectType: 'word' },
        select: { subjectId: true },
      }),
    ]);
    const existingIds = existingCards.map((card) => card.subjectId);
    const newCount = categorySlugs.length > 0
      ? await this.prisma.syncedWord.count({
          where: {
            categories: { hasSome: categorySlugs },
            ...(existingIds.length > 0 ? { id: { notIn: existingIds } } : {}),
          },
        })
      : 0;

    const byStatus = new Map(statusRows.map((row) => [row.status, row._count._all]));
    return {
      new: newCount,
      learning: byStatus.get('learning') ?? 0,
      learned: byStatus.get('learned') ?? 0,
      known: byStatus.get('known') ?? 0,
      with_errors: errorCount,
    };
  }

  async listCategories() {
    const categories = await this.prisma.syncedWordCategory.findMany({ orderBy: { slug: 'asc' } });
    const rows = await this.prisma.$queryRaw<Array<{ category: string; word_count: bigint }>>`
      SELECT category, COUNT(*)::bigint AS word_count
      FROM synced_words, unnest(categories) AS category
      GROUP BY category
    `;
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(String(row.category), Number(row.word_count));
    return {
      items: categories.map((category) => ({
        slug: category.slug,
        name_ru: category.nameRu,
        name_en: category.nameEn,
        word_count: counts.get(category.slug) ?? 0,
      })),
    };
  }

  async getPreferences(userId: string) {
    const preferences = await this.prisma.wordLearningPreference.findUnique({ where: { userId } });
    return { category_slugs: preferences?.categorySlugs ?? [] };
  }

  async savePreferences(userId: string, categorySlugs: string[]) {
    if (!Array.isArray(categorySlugs)) {
      throw new BadRequestException('category_slugs must be an array of strings');
    }
    const slugs = [...new Set(
      categorySlugs
        .map((slug) => (typeof slug === 'string' ? slug.trim().toLowerCase().replace(/\s+/g, '_') : ''))
        .filter(Boolean),
    )];
    await this.prisma.wordLearningPreference.upsert({
      where: { userId },
      create: { userId, categorySlugs: slugs },
      update: { categorySlugs: slugs },
    });
    return { category_slugs: slugs };
  }
}

export interface CardTransitionInput {
  stage: number;
  reviewCount: number;
  errorCount: number;
}

export interface CardTransitionResult {
  status: string;
  stage: number;
  reviewCount: number;
  errorCount: number;
  lastAnswerWrong: boolean;
  nextReviewAt: Date | null;
  lastReviewedAt: Date;
}

export function nextCardState(
  card: CardTransitionInput,
  remembered: boolean,
  now: Date,
  intervals: number[],
): CardTransitionResult {
  if (remembered) {
    if (card.stage >= intervals.length - 1) {
      return {
        status: 'learned',
        stage: card.stage,
        reviewCount: card.reviewCount + 1,
        errorCount: 0,
        lastAnswerWrong: false,
        nextReviewAt: null,
        lastReviewedAt: now,
      };
    }
    return {
      status: 'learning',
      stage: card.stage + 1,
      reviewCount: card.reviewCount + 1,
      errorCount: 0,
      lastAnswerWrong: false,
      nextReviewAt: new Date(now.getTime() + intervals[card.stage]),
      lastReviewedAt: now,
    };
  }

  const errorCount = card.errorCount + 1;
  const stage = errorCount >= 4 ? Math.max(0, card.stage - 1) : card.stage;
  return {
    status: 'learning',
    stage,
    reviewCount: card.reviewCount + 1,
    errorCount,
    lastAnswerWrong: true,
    nextReviewAt: new Date(now.getTime() + intervals[stage]),
    lastReviewedAt: now,
  };
}

function intervalsFor(subjectType: string) {
  return INTERVALS_BY_SUBJECT[subjectType] ?? WORD_INTERVALS_MS;
}

function uniqueCard(userId: string, subjectType: string, subjectId: string) {
  return { userId_subjectType_subjectId: { userId, subjectType, subjectId } };
}

function parseLimit(value?: string) {
  if (value === undefined || value === '') return DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) throw new BadRequestException('limit must be a positive integer');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new BadRequestException('limit must be a positive integer');
  }
  return Math.min(parsed, MAX_LIMIT);
}

function toWordContent(word: {
  id: string;
  word: string;
  translation: string;
  transcription: string | null;
  examples: unknown;
  categories: string[];
}) {
  return {
    id: word.id,
    word: word.word,
    translation: word.translation,
    transcription: word.transcription,
    examples: word.examples as unknown as Record<string, string>[],
    categories: word.categories,
  };
}

function toCardResponse(card: {
  id: string;
  status: string;
  stage: number;
  reviewCount: number;
  errorCount: number;
  lastAnswerWrong: boolean;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;
  startedAt: Date;
  updatedAt: Date;
}) {
  return {
    id: card.id,
    status: card.status,
    stage: card.stage,
    review_count: card.reviewCount,
    error_count: card.errorCount,
    last_answer_wrong: card.lastAnswerWrong,
    next_review_at: card.nextReviewAt?.toISOString() ?? null,
    last_reviewed_at: card.lastReviewedAt?.toISOString() ?? null,
    started_at: card.startedAt.toISOString(),
    updated_at: card.updatedAt.toISOString(),
  };
}

function newCardState() {
  return {
    status: 'new',
    stage: 0,
    review_count: 0,
    error_count: 0,
    last_answer_wrong: false,
    next_review_at: null,
  };
}
