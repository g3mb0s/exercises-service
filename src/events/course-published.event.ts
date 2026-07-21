export interface CoursePublishedEvent {
  eventId: string;
  type: 'content.course.published';
  version: 1;
  occurredAt: string;
  course: { id: string; slug: string; publishedAt: string; sections: Array<{ id: string; position: number; units: Array<{ id: string; position: number; entries: Array<{ id: string; position: number; contentType: 'article' | 'exercise'; contentId: string }> }> }> };
}

export function parseCoursePublishedEvent(value: Buffer): CoursePublishedEvent {
  let input: unknown;
  try { input = JSON.parse(value.toString('utf8')); } catch { throw new Error('course event is not valid JSON'); }
  if (!isObject(input) || input.type !== 'content.course.published' || input.version !== 1 || !isUuid(input.eventId) || !isObject(input.course)) throw new Error('unsupported course event envelope');
  const course = input.course;
  if (!isUuid(course.id) || typeof course.slug !== 'string' || !isDate(course.publishedAt) || !Array.isArray(course.sections)) throw new Error('invalid course event body');
  for (const section of course.sections) {
    if (!isObject(section) || !isUuid(section.id) || !Number.isInteger(section.position) || !Array.isArray(section.units)) throw new Error('invalid section in course event');
    for (const unit of section.units) {
      if (!isObject(unit) || !isUuid(unit.id) || !Number.isInteger(unit.position) || !Array.isArray(unit.entries)) throw new Error('invalid unit in course event');
      for (const entry of unit.entries) {
        if (!isObject(entry) || !isUuid(entry.id) || !Number.isInteger(entry.position) || (entry.contentType !== 'article' && entry.contentType !== 'exercise') || !isUuid(entry.contentId)) throw new Error('invalid entry in course event');
      }
    }
  }
  return input as unknown as CoursePublishedEvent;
}

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isUuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function isDate(value: unknown): value is string { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }
