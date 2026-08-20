import { nextCardState, SrsService } from './srs.service';
import { PrismaService } from '../db/prisma.service';

const now = new Date('2026-08-20T08:00:00.000Z');
const intervals = [2 * 60 * 60 * 1000, 24 * 60 * 60 * 1000, 2 * 24 * 60 * 60 * 1000, 5 * 24 * 60 * 60 * 1000, 10 * 24 * 60 * 60 * 1000, 30 * 24 * 60 * 60 * 1000];

describe('SRS card transitions', () => {
  it('starts a remembered card at 2 hours after the first success', () => {
    const next = nextCardState({ stage: 0, reviewCount: 0, errorCount: 0 }, true, now, intervals);
    expect(next).toEqual(expect.objectContaining({
      status: 'learning',
      stage: 1,
      reviewCount: 1,
      errorCount: 0,
      lastAnswerWrong: false,
      nextReviewAt: new Date(now.getTime() + intervals[0]),
    }));
  });

  it('applies the interval list in order on successive successes', () => {
    const history = [
      { stage: 0, reviewCount: 0, errorCount: 0 },
      { stage: 1, reviewCount: 1, errorCount: 0 },
      { stage: 2, reviewCount: 2, errorCount: 0 },
      { stage: 3, reviewCount: 3, errorCount: 0 },
      { stage: 4, reviewCount: 4, errorCount: 0 },
    ];
    const delays = history.map((card) => {
      const next = nextCardState(card, true, now, intervals);
      return next.nextReviewAt!.getTime() - now.getTime();
    });
    expect(delays).toEqual(intervals.slice(0, 5));
  });

  it('graduates to learned on the 6th successful answer', () => {
    const next = nextCardState({ stage: 5, reviewCount: 5, errorCount: 0 }, true, now, intervals);
    expect(next).toEqual(expect.objectContaining({
      status: 'learned',
      stage: 5,
      reviewCount: 6,
      errorCount: 0,
      nextReviewAt: null,
    }));
  });

  it('repeats the same interval on a forgotten answer', () => {
    const next = nextCardState({ stage: 2, reviewCount: 2, errorCount: 0 }, false, now, intervals);
    expect(next).toEqual(expect.objectContaining({
      status: 'learning',
      stage: 2,
      reviewCount: 3,
      errorCount: 1,
      lastAnswerWrong: true,
      nextReviewAt: new Date(now.getTime() + intervals[2]),
    }));
  });

  it('decrements the stage after 4 consecutive failures', () => {
    const next = nextCardState({ stage: 2, reviewCount: 5, errorCount: 3 }, false, now, intervals);
    expect(next).toEqual(expect.objectContaining({
      stage: 1,
      errorCount: 4,
      nextReviewAt: new Date(now.getTime() + intervals[1]),
    }));
  });

  it('does not decrement the stage below zero', () => {
    const next = nextCardState({ stage: 0, reviewCount: 0, errorCount: 3 }, false, now, intervals);
    expect(next).toEqual(expect.objectContaining({
      stage: 0,
      errorCount: 4,
      nextReviewAt: new Date(now.getTime() + intervals[0]),
    }));
  });

  it('resets errorCount to zero on any success', () => {
    const next = nextCardState({ stage: 1, reviewCount: 4, errorCount: 3 }, true, now, intervals);
    expect(next).toEqual(expect.objectContaining({
      stage: 2,
      errorCount: 0,
      reviewCount: 5,
    }));
  });
});

describe('SrsService', () => {
  let prisma: any;
  let service: SrsService;

  beforeEach(() => {
    prisma = {
      wordLearningPreference: { findUnique: jest.fn() },
      srsCard: { groupBy: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      syncedWord: { count: jest.fn() },
      $queryRaw: jest.fn(),
    };
    service = new SrsService(prisma as unknown as PrismaService);
    jest.clearAllMocks();
  });

  describe('getNew', () => {
    it('returns no words without selected categories', async () => {
      prisma.wordLearningPreference.findUnique.mockResolvedValue(null);
      await expect(service.getNew('u1', '10')).resolves.toEqual({ items: [] });
    });

    it('requests a random sample of words excluding started cards', async () => {
      prisma.wordLearningPreference.findUnique.mockResolvedValue({ categorySlugs: ['verbs', 'nouns'] });
      prisma.srsCard.findMany.mockResolvedValue([{ subjectId: 'existing-1' }]);
      prisma.$queryRaw.mockResolvedValue([
        { id: 'w2', word: 'run', translation: 'бежать', transcription: null, examples: [], categories: ['verbs'] },
      ]);

      const result = await service.getNew('u1', '5');

      expect(prisma.srsCard.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', subjectType: 'word' },
        select: { subjectId: true },
      });
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ id: 'w2', word: 'run', card: { status: 'new' } });
    });
  });

  describe('getStats', () => {
    it('returns per-status and error counts plus available new words', async () => {
      prisma.wordLearningPreference.findUnique.mockResolvedValue({ categorySlugs: ['verbs'] });
      prisma.srsCard.groupBy.mockResolvedValue([
        { status: 'learning', _count: { _all: 3 } },
        { status: 'learned', _count: { _all: 5 } },
      ]);
      prisma.srsCard.count.mockResolvedValue(2);
      prisma.srsCard.findMany.mockResolvedValue([{ subjectId: 'w1' }]);
      prisma.syncedWord.count.mockResolvedValue(7);

      await expect(service.getStats('u1')).resolves.toEqual({
        new: 7,
        learning: 3,
        learned: 5,
        known: 0,
        with_errors: 2,
      });
    });

    it('reports zero new words without selected categories', async () => {
      prisma.wordLearningPreference.findUnique.mockResolvedValue(null);
      prisma.srsCard.groupBy.mockResolvedValue([]);
      prisma.srsCard.count.mockResolvedValue(0);
      prisma.srsCard.findMany.mockResolvedValue([]);

      await expect(service.getStats('u1')).resolves.toEqual({
        new: 0,
        learning: 0,
        learned: 0,
        known: 0,
        with_errors: 0,
      });
    });
  });
});
