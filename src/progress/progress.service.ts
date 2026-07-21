import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getConfig } from '../config';
import { PrismaService } from '../db/prisma.service';
import { CourseRegistryService } from '../events/course-registry.service';

export interface ExerciseAttempt {
  answers?: Array<{ itemId: string; gaps: Record<string, string> }>;
  items?: Array<{ itemId: string; gaps?: Record<string, string>; pairs?: string[][]; answer?: string[] }>;
}

@Injectable()
export class ProgressService {
  private readonly contentServiceUrl = getConfig().contentServiceUrl;
  constructor(private readonly prisma: PrismaService, private readonly registry: CourseRegistryService) {}

  async getCourseProgress(userId: string, courseId: string) {
    const course = await this.registry.getOrSynchronizeCourse(courseId);
    if (!course) throw new NotFoundException('Course is not synchronized');
    const progress = await this.prisma.courseItemProgress.findMany({ where: { userId, itemId: { in: [courseId, ...course.items.map((item) => item.itemId)] } } });
    const entries = course.items.filter((item) => item.itemType === 'entry');
    const completedEntries = progress.filter((item) => item.itemType === 'entry' && item.isCompleted).length;
    const orderedEntries = orderCourseEntries(course.items);
    const completedIds = new Set(progress.filter((item) => item.itemType === 'entry' && item.isCompleted).map((item) => item.itemId));
    const nextEntry = orderedEntries.find((entry) => !completedIds.has(entry.itemId));
    return { course_id: courseId, total_entries: entries.length, completed_entries: completedEntries, progress_percent: entries.length ? Math.round((completedEntries / entries.length) * 100) : 0, is_completed: progress.some((item) => item.itemType === 'course' && item.itemId === courseId && item.isCompleted), next_entry_id: nextEntry?.itemId ?? null, items: progress.map(toProgressResponse) };
  }

  async getLearningEntry(userId: string, courseId: string, entryId: string) {
    await this.registry.getOrSynchronizeCourse(courseId).then((course) => { if (!course) throw new NotFoundException('Published course not found'); });
    const entry = await this.prisma.courseContentItem.findFirst({ where: { courseId, itemId: entryId, itemType: 'entry' } });
    if (!entry || !entry.referencedContentId || !entry.referencedType) throw new NotFoundException('Course entry not found');
    await this.ensureEntryAccessible(userId, entry);
    const response = await fetch(`${this.contentServiceUrl}/${entry.referencedType === 'article' ? 'articles' : 'exercises'}/${entry.referencedContentId}`);
    if (!response.ok) throw new BadRequestException('Entry content is unavailable or not published');
    const body = await response.json() as Record<string, unknown>;
    return { entry: { id: entry.itemId, type: entry.referencedType, content_id: entry.referencedContentId, content: body[entry.referencedType] } };
  }

  async completeArticle(userId: string, entryId: string) {
    const entry = await this.findEntry(entryId, 'article');
    await this.ensureEntryAccessible(userId, entry);
    await this.prisma.$transaction([
      this.prisma.articleProgress.upsert({ where: { userId_articleId: { userId, articleId: entry.referencedContentId! } }, create: { userId, articleId: entry.referencedContentId!, isCompleted: true }, update: { isCompleted: true } }),
      this.prisma.courseItemProgress.upsert({ where: { userId_itemType_itemId: { userId, itemType: 'entry', itemId: entryId } }, create: { userId, itemType: 'entry', itemId: entryId, isCompleted: true }, update: { isCompleted: true } }),
    ]);
    await this.recalculateCourse(userId, entry.courseId);
    return this.getCourseProgress(userId, entry.courseId);
  }

  async attemptExercise(userId: string, entryId: string, attempt: ExerciseAttempt) {
    const entry = await this.findEntry(entryId, 'exercise');
    await this.ensureEntryAccessible(userId, entry);
    const exercise = await this.fetchExercise(entry.referencedContentId!);
    const result = evaluateExercise(exercise.type, exercise.payload, attempt);
    const current = await this.prisma.courseItemProgress.findUnique({ where: { userId_itemType_itemId: { userId, itemType: 'entry', itemId: entryId } } });
    await this.prisma.$transaction([
      this.prisma.exerciseProgress.upsert({
        where: { userId_exerciseId: { userId, exerciseId: entry.referencedContentId! } },
        create: { userId, exerciseId: entry.referencedContentId!, isCompleted: result.passed, failedTimes: result.passed ? 0 : 1, completedTimes: result.passed ? 1 : 0, bestScore: result.score },
        update: { isCompleted: result.passed ? true : undefined, failedTimes: result.passed ? undefined : { increment: 1 }, completedTimes: result.passed ? { increment: 1 } : undefined, bestScore: result.score },
      }),
      this.prisma.courseItemProgress.upsert({
        where: { userId_itemType_itemId: { userId, itemType: 'entry', itemId: entryId } },
        create: { userId, itemType: 'entry', itemId: entryId, isCompleted: result.passed, wasFailed: !result.passed, wasFailFixed: false },
        update: { isCompleted: result.passed ? true : undefined, wasFailed: result.passed ? undefined : true, wasFailFixed: result.passed && current?.wasFailed ? true : undefined },
      }),
    ]);
    await this.recalculateCourse(userId, entry.courseId);
    return { ...result, course_progress: await this.getCourseProgress(userId, entry.courseId) };
  }

  private async findEntry(entryId: string, expectedType: 'article' | 'exercise') {
    const entry = await this.prisma.courseContentItem.findFirst({ where: { itemId: entryId, itemType: 'entry' } });
    if (!entry) throw new NotFoundException('Course entry is not synchronized');
    if (entry.referencedType !== expectedType || !entry.referencedContentId) throw new BadRequestException(`Course entry does not reference an ${expectedType}`);
    return entry;
  }

  private async fetchExercise(exerciseId: string) {
    const response = await fetch(`${this.contentServiceUrl}/exercises/${exerciseId}`);
    if (!response.ok) throw new BadRequestException('Referenced exercise is unavailable or not published');
    return (await response.json() as { exercise: { type: string; payload: Record<string, unknown> } }).exercise;
  }

  private async ensureEntryAccessible(userId: string, entry: { courseId: string; itemId: string }) {
    const items = await this.prisma.courseContentItem.findMany({ where: { courseId: entry.courseId } });
    const ordered = orderCourseEntries(items);
    if (!ordered.some((item) => item.itemId === entry.itemId)) throw new NotFoundException('Course entry not found');
    const progress = await this.prisma.courseItemProgress.findMany({ where: { userId, itemType: 'entry', itemId: { in: ordered.map((item) => item.itemId) }, isCompleted: true } });
    const completed = new Set(progress.map((item) => item.itemId));
    if (!isEntryAccessible(ordered.map((item) => item.itemId), completed, entry.itemId)) throw new ForbiddenException('Complete previous course materials first');
  }

  private async recalculateCourse(userId: string, courseId: string) {
    const items = await this.prisma.courseContentItem.findMany({ where: { courseId } });
    const current = await this.prisma.courseItemProgress.findMany({ where: { userId, itemId: { in: items.map((item) => item.itemId) } } });
    const completed = new Set(current.filter((item) => item.isCompleted).map((item) => item.itemId));
    const units = items.filter((item) => item.itemType === 'unit');
    const sections = items.filter((item) => item.itemType === 'section');
    for (const unit of units) { const children = items.filter((item) => item.itemType === 'entry' && item.parentItemId === unit.itemId); if (children.length && children.every((item) => completed.has(item.itemId))) completed.add(unit.itemId); else completed.delete(unit.itemId); }
    for (const section of sections) { const children = units.filter((item) => item.parentItemId === section.itemId); if (children.length && children.every((item) => completed.has(item.itemId))) completed.add(section.itemId); else completed.delete(section.itemId); }
    const courseCompleted = sections.length > 0 && sections.every((item) => completed.has(item.itemId));
    const aggregateItems = [...units, ...sections].map((item) => ({ itemId: item.itemId, itemType: item.itemType, isCompleted: completed.has(item.itemId) }));
    aggregateItems.push({ itemId: courseId, itemType: 'course', isCompleted: courseCompleted });
    await this.prisma.$transaction(aggregateItems.map((item) => this.prisma.courseItemProgress.upsert({ where: { userId_itemType_itemId: { userId, itemType: item.itemType, itemId: item.itemId } }, create: { userId, ...item }, update: { isCompleted: item.isCompleted } })));
  }
}

export function evaluateExercise(type: string, payload: Record<string, unknown>, attempt: ExerciseAttempt) {
  if (type === 'fill_gap_choice' || type === 'fill_gap_input') return evaluateFillGaps(payload, attempt);
  if (type === 'matching') return evaluateMatching(payload, attempt);
  if (type === 'sentence_from_audio' || type === 'sentence_from_translation') return evaluateSentences(payload, attempt);
  throw new BadRequestException(`Unsupported exercise type: ${type}`);
}

export function evaluateFillGapChoice(payload: Record<string, unknown>, attempt: ExerciseAttempt) {
  return evaluateFillGaps(payload, attempt);
}

function evaluateFillGaps(payload: Record<string, unknown>, attempt: ExerciseAttempt) {
  const content = payload.content as Record<string, unknown> | undefined;
  const items = Array.isArray(content?.items) ? content.items as Record<string, unknown>[] : [];
  const caseSensitive = Boolean((payload.settings as Record<string, unknown> | undefined)?.caseSensitive);
  let correct = 0;
  let total = 0;
  const details: Array<{ itemId: string; key: string; correct: boolean }> = [];
  for (const item of items) {
    const itemId = String(item.id ?? '');
    const submitted = submittedItems(attempt).find((answer) => answer.itemId === itemId)?.gaps ?? {};
    const gaps = Array.isArray(item.gaps) ? item.gaps as Record<string, unknown>[] : [];
    for (const gap of gaps) {
      const key = String(gap.key ?? '');
      const validAnswers = [...(Array.isArray(gap.answers) ? gap.answers : []), ...(Array.isArray(gap.acceptedAnswers) ? gap.acceptedAnswers : [])];
      const answers = validAnswers.map((answer) => normalize(String(answer), caseSensitive));
      const isCorrect = answers.includes(normalize(submitted[key] ?? '', caseSensitive));
      total += 1;
      if (isCorrect) correct += 1;
      details.push({ itemId, key, correct: isCorrect });
    }
  }
  if (!total) throw new BadRequestException('Exercise has no answerable gaps');
  return { passed: correct === total, correct, total, score: correct / total, details };
}

function evaluateMatching(payload: Record<string, unknown>, attempt: ExerciseAttempt) {
  const items = exerciseItems(payload);
  let correct = 0;
  let total = 0;
  const details: Array<{ itemId: string; key: string; correct: boolean }> = [];
  items.forEach((item, index) => {
    const itemId = String(item.id ?? `item-${index}`);
    const submitted = new Set((submittedItems(attempt).find((answer) => answer.itemId === itemId)?.pairs ?? []).map(pairKey));
    const expected = Array.isArray(item.pairs) ? item.pairs as unknown[] : [];
    for (const pair of expected) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const key = pairKey(pair);
      const isCorrect = submitted.has(key);
      total += 1;
      if (isCorrect) correct += 1;
      details.push({ itemId, key: String(pair[0]), correct: isCorrect });
    }
  });
  if (!total) throw new BadRequestException('Exercise has no answerable pairs');
  return { passed: correct === total, correct, total, score: correct / total, details };
}

function evaluateSentences(payload: Record<string, unknown>, attempt: ExerciseAttempt) {
  const items = exerciseItems(payload);
  let correct = 0;
  const details = items.map((item, index) => {
    const itemId = String(item.id ?? `item-${index}`);
    const expected = (Array.isArray(item.answer) ? item.answer : []).map(String);
    const submitted = submittedItems(attempt).find((answer) => answer.itemId === itemId)?.answer ?? [];
    const isCorrect = expected.length > 0 && expected.length === submitted.length && expected.every((wordId, wordIndex) => wordId === submitted[wordIndex]);
    if (isCorrect) correct += 1;
    return { itemId, key: 'answer', correct: isCorrect };
  });
  if (!items.length) throw new BadRequestException('Exercise has no answerable sentences');
  return { passed: correct === items.length, correct, total: items.length, score: correct / items.length, details };
}

function exerciseItems(payload: Record<string, unknown>) {
  const content = payload.content as Record<string, unknown> | undefined;
  return Array.isArray(content?.items) ? content.items as Record<string, unknown>[] : [];
}

function submittedItems(attempt: ExerciseAttempt): Array<{ itemId: string; gaps?: Record<string, string>; pairs?: string[][]; answer?: string[] }> { return attempt.items ?? attempt.answers ?? []; }
function pairKey(pair: unknown[]) { return `${String(pair[0] ?? '')}\u0000${String(pair[1] ?? '')}`; }

function normalize(value: string, caseSensitive: boolean) { const trimmed = value.trim(); return caseSensitive ? trimmed : trimmed.toLocaleLowerCase(); }
function toProgressResponse(item: { itemId: string; itemType: string; isCompleted: boolean; wasFailed: boolean; wasFailFixed: boolean }) { return { item_id: item.itemId, item_type: item.itemType, is_completed: item.isCompleted, was_failed: item.wasFailed, was_fail_fixed: item.wasFailFixed }; }

export function orderCourseEntries(items: Array<{ itemId: string; itemType: string; parentItemId: string | null; position: number }>) {
  const sections = items.filter((item) => item.itemType === 'section').sort((a, b) => a.position - b.position);
  const units = items.filter((item) => item.itemType === 'unit');
  const entries = items.filter((item) => item.itemType === 'entry');
  return sections.flatMap((section) => units.filter((unit) => unit.parentItemId === section.itemId).sort((a, b) => a.position - b.position).flatMap((unit) => entries.filter((entry) => entry.parentItemId === unit.itemId).sort((a, b) => a.position - b.position)));
}

export function isEntryAccessible(orderedEntryIds: string[], completed: Set<string>, targetId: string) {
  if (completed.has(targetId)) return true;
  const targetIndex = orderedEntryIds.indexOf(targetId);
  const firstIncompleteIndex = orderedEntryIds.findIndex((id) => !completed.has(id));
  return targetIndex >= 0 && (firstIncompleteIndex < 0 || targetIndex <= firstIncompleteIndex);
}
