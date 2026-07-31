import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';

const studyInclude = {
  clip: {
    include: {
      movie: true,
    },
  },
} as const;

@Injectable()
export class ClipStudyService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string, movieId: string, clipId: string) {
    const clip = await this.prisma.syncedMovieClip.findFirst({
      where: { id: clipId, movieId },
    });
    if (!clip) throw new NotFoundException('Movie clip is not synchronized');
    const study = await this.prisma.clipStudy.upsert({
      where: { userId_clipId: { userId, clipId } },
      create: { userId, clipId },
      update: {},
      include: studyInclude,
    });
    return { clip: toResponse(study) };
  }

  async list(userId: string) {
    const studies = await this.prisma.clipStudy.findMany({
      where: { userId },
      include: studyInclude,
      orderBy: { startedAt: 'desc' },
    });
    return { items: studies.map(toResponse) };
  }

  async get(userId: string, clipId: string) {
    const study = await this.prisma.clipStudy.findUnique({
      where: { userId_clipId: { userId, clipId } },
      include: studyInclude,
    });
    if (!study) throw new NotFoundException('Studied clip not found');
    return { clip: toResponse(study) };
  }
}

function toResponse(study: {
  startedAt: Date;
  clip: {
    id: string;
    position: number;
    startMs: number;
    endMs: number;
    movie: {
      id: string;
      title: string;
      thumbnailUrl: string | null;
    };
  };
}) {
  return {
    id: study.clip.id,
    position: study.clip.position,
    start_ms: study.clip.startMs,
    end_ms: study.clip.endMs,
    started_at: study.startedAt,
    movie: {
      id: study.clip.movie.id,
      title: study.clip.movie.title,
      thumbnail_url: study.clip.movie.thumbnailUrl,
    },
  };
}
