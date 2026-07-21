import { PrismaService } from '../db/prisma.service';
import { CourseRegistryService, snapshotToEvent } from './course-registry.service';

describe('CourseRegistryService pull synchronization', () => {
  it('tries synchronization before returning a missing course', async () => {
    const registry = new CourseRegistryService({} as PrismaService);
    const snapshot = { id: '11111111-1111-4111-8111-111111111111' };
    jest.spyOn(registry, 'getCourse').mockResolvedValueOnce(null).mockResolvedValueOnce(snapshot as never);
    const synchronize = jest.spyOn(registry, 'synchronizeCourse').mockResolvedValue(true);

    await expect(registry.getOrSynchronizeCourse(snapshot.id)).resolves.toBe(snapshot);
    expect(synchronize).toHaveBeenCalledWith(snapshot.id);
  });

  it('converts the content-service snapshot to the Kafka contract', () => {
    const event = snapshotToEvent({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'english-basics',
      published_at: '2026-07-21T12:00:00.000Z',
      sections: [{ id: '22222222-2222-4222-8222-222222222222', position: 0, units: [{ id: '33333333-3333-4333-8333-333333333333', position: 0, entries: [{ id: '44444444-4444-4444-8444-444444444444', position: 0, type: 'exercise', content_id: '55555555-5555-4555-8555-555555555555' }] }] }],
    });
    expect(event.course.sections[0].units[0].entries[0]).toMatchObject({ contentType: 'exercise', contentId: '55555555-5555-4555-8555-555555555555' });
  });
});
