# Exercise Service Guide

## Scope

This NestJS service owns the local published-course registry, course accessibility rules, article/exercise progress, and server-side exercise evaluation. Content authoring remains in `content_service`.

## Integration Rules

- Consume `content.course.published` v1 from `content.course-events`; see `INTEGRATION.md` for the contract.
- Event handling must be idempotent by `eventId`. Apply an entire course snapshot and record the event in one database transaction.
- If a course is absent locally, try to synchronize its published snapshot from `content_service` before returning `404`. Use a temporary-availability error when synchronization cannot be attempted reliably.
- Never trust the frontend to decide whether an entry is unlocked or whether an answer is correct.
- Course order is section position, then unit position, then entry position. Completed earlier entries remain accessible; only the first incomplete entry is newly accessible.
- Evaluation responses may report correctness and score but must not expose expected answers.
- Add support for exercise types through the shared evaluator dispatch and include focused unit tests for accepted, rejected, partial, and malformed attempts.

## Database Changes

Use Prisma exclusively. Add new migrations instead of editing applied migrations. Registry replacement, processed-event recording, and related progress updates should be transactional when consistency depends on them.

## Verification

Run:

```bash
npm test -- --runInBand
npm run build
```

Do not commit `dist/`, `node_modules/`, coverage, environment files, or credentials.
