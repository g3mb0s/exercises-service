import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { getConfig } from '../config';
import { PrismaService } from '../db/prisma.service';
import { CoursePublishedEvent } from './course-published.event';

@Injectable()
export class CourseRegistryService {
  private readonly contentServiceUrl = getConfig().contentServiceUrl;
  constructor(private readonly prisma: PrismaService) {}
  async apply(event: CoursePublishedEvent): Promise<'applied' | 'duplicate'> {
    return this.prisma.$transaction(async (tx) => {
      if (await tx.processedEvent.findUnique({ where: { eventId: event.eventId } })) return 'duplicate';
      const course = event.course;
      await tx.syncedCourse.upsert({ where: { id: course.id }, create: { id: course.id, slug: course.slug, publishedAt: new Date(course.publishedAt) }, update: { slug: course.slug, publishedAt: new Date(course.publishedAt), syncedAt: new Date() } });
      await tx.courseContentItem.deleteMany({ where: { courseId: course.id } });
      await tx.contentReference.deleteMany({ where: { courseId: course.id } });
      const items: Prisma.CourseContentItemCreateManyInput[] = [];
      const references = new Map<string, Prisma.ContentReferenceCreateManyInput>();
      for (const section of course.sections) {
        items.push({ courseId: course.id, itemId: section.id, itemType: 'section', parentItemId: course.id, position: section.position });
        for (const unit of section.units) {
          items.push({ courseId: course.id, itemId: unit.id, itemType: 'unit', parentItemId: section.id, position: unit.position });
          for (const entry of unit.entries) {
            items.push({ courseId: course.id, itemId: entry.id, itemType: 'entry', parentItemId: unit.id, position: entry.position, referencedType: entry.contentType, referencedContentId: entry.contentId });
            references.set(`${entry.contentType}:${entry.contentId}`, { courseId: course.id, contentType: entry.contentType, contentId: entry.contentId });
          }
        }
      }
      if (items.length) await tx.courseContentItem.createMany({ data: items });
      if (references.size) await tx.contentReference.createMany({ data: [...references.values()] });
      await tx.processedEvent.create({ data: { eventId: event.eventId, eventType: event.type } });
      return 'applied';
    });
  }
  async getCourse(courseId: string) { return this.prisma.syncedCourse.findUnique({ where: { id: courseId }, include: { items: { orderBy: [{ itemType: 'asc' }, { position: 'asc' }] }, references: { orderBy: [{ contentType: 'asc' }, { contentId: 'asc' }] } } }); }

  async getOrSynchronizeCourse(courseId: string) {
    const current = await this.getCourse(courseId);
    if (current) return current;
    if (!await this.synchronizeCourse(courseId)) return null;
    return this.getCourse(courseId);
  }

  async synchronizeCourse(courseId: string): Promise<boolean> {
    let response: Response;
    try { response = await fetch(`${this.contentServiceUrl}/courses/id/${courseId}`); } catch { throw new ServiceUnavailableException('Content service is unavailable for course synchronization'); }
    if (response.status === 404) return false;
    if (!response.ok) throw new ServiceUnavailableException(`Content service synchronization failed with status ${response.status}`);
    const payload = await response.json() as { course?: PublishedCourseSnapshot };
    if (!payload.course || payload.course.id !== courseId) throw new ServiceUnavailableException('Content service returned an invalid course snapshot');
    await this.apply(snapshotToEvent(payload.course));
    return true;
  }
}

interface PublishedCourseSnapshot {
  id: string;
  slug: string;
  published_at: string;
  sections: Array<{ id: string; position: number; units: Array<{ id: string; position: number; entries: Array<{ id: string; position: number; type: 'article' | 'exercise'; content_id: string }> }> }>;
}

export function snapshotToEvent(course: PublishedCourseSnapshot): CoursePublishedEvent {
  return {
    eventId: randomUUID(),
    type: 'content.course.published',
    version: 1,
    occurredAt: new Date().toISOString(),
    course: {
      id: course.id,
      slug: course.slug,
      publishedAt: course.published_at,
      sections: course.sections.map((section) => ({ id: section.id, position: section.position, units: section.units.map((unit) => ({ id: unit.id, position: unit.position, entries: unit.entries.map((entry) => ({ id: entry.id, position: entry.position, contentType: entry.type, contentId: entry.content_id })) })) })),
    },
  };
}
