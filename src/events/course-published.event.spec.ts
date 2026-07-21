import { parseCoursePublishedEvent } from './course-published.event';

describe('course published event contract', () => {
  it('accepts a version 1 hierarchy with content ids', () => {
    const event = parseCoursePublishedEvent(Buffer.from(JSON.stringify(validEvent())));
    expect(event.course.sections[0].units[0].entries[0]).toEqual({
      id: '44444444-4444-4444-8444-444444444444',
      position: 0,
      contentType: 'article',
      contentId: '55555555-5555-4555-8555-555555555555',
    });
  });

  it('rejects unsupported versions', () => {
    expect(() => parseCoursePublishedEvent(Buffer.from(JSON.stringify({ ...validEvent(), version: 2 })))).toThrow('unsupported course event envelope');
  });
});

function validEvent() {
  return {
    eventId: '11111111-1111-4111-8111-111111111111',
    type: 'content.course.published',
    version: 1,
    occurredAt: '2026-07-21T12:00:00.000Z',
    course: {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'english-basics',
      publishedAt: '2026-07-21T12:00:00.000Z',
      sections: [{ id: '33333333-3333-4333-8333-333333333333', position: 0, units: [{ id: '66666666-6666-4666-8666-666666666666', position: 0, entries: [{ id: '44444444-4444-4444-8444-444444444444', position: 0, contentType: 'article', contentId: '55555555-5555-4555-8555-555555555555' }] }] }],
    },
  };
}
