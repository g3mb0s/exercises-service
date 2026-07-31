import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';
import { ClipStudyService } from './clip-study.service';

const userId = '11111111-1111-4111-8111-111111111111';
const movieId = '22222222-2222-4222-8222-222222222222';
const clipId = '33333333-3333-4333-8333-333333333333';

describe('ClipStudyService', () => {
  it('starts studying a synchronized clip idempotently', async () => {
    const study = studyFixture();
    const prisma = {
      syncedMovieClip: { findFirst: jest.fn(async () => ({ id: clipId, movieId })) },
      clipStudy: { upsert: jest.fn(async () => study) },
    };
    const service = new ClipStudyService(prisma as unknown as PrismaService);

    const result = await service.start(userId, movieId, clipId);

    expect(prisma.clipStudy.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_clipId: { userId, clipId } },
      create: { userId, clipId },
      update: {},
    }));
    expect(result.clip).toMatchObject({
      id: clipId,
      position: 0,
      movie: { id: movieId, title: 'Movie' },
    });
  });

  it('rejects a clip that is not in the synchronized movie registry', async () => {
    const prisma = {
      syncedMovieClip: { findFirst: jest.fn(async () => null) },
      clipStudy: { upsert: jest.fn() },
    };
    const service = new ClipStudyService(prisma as unknown as PrismaService);

    await expect(service.start(userId, movieId, clipId)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.clipStudy.upsert).not.toHaveBeenCalled();
  });

  it('returns only a clip added by the current user', async () => {
    const study = studyFixture();
    const prisma = {
      clipStudy: { findUnique: jest.fn(async () => study) },
    };
    const service = new ClipStudyService(prisma as unknown as PrismaService);

    await expect(service.get(userId, clipId)).resolves.toMatchObject({
      clip: { id: clipId, movie: { id: movieId } },
    });
    expect(prisma.clipStudy.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_clipId: { userId, clipId } },
    }));
  });
});

function studyFixture() {
  return {
    startedAt: new Date('2026-07-31T08:00:00.000Z'),
    clip: {
      id: clipId,
      position: 0,
      startMs: 0,
      endMs: 10_000,
      movie: {
        id: movieId,
        title: 'Movie',
        thumbnailUrl: 'https://storage.example/poster.jpg',
      },
    },
  };
}
