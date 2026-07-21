# Exercise Service

Consumes `content.course.published` version 1 events from Kafka and maintains a local registry of every section, unit, entry, article ID, and exercise ID. Re-delivery is idempotent through `processed_events`; a newer publication atomically replaces the previous course snapshot.

If a requested course is missing locally, the service first pulls the published snapshot from `content_service` by course ID and applies it through the same registry transaction. It returns `404` only when content-service confirms that no published course exists, and `503` when synchronization is temporarily unavailable.

## Endpoints

- `GET /health/live`
- `GET /content-registry/courses/:courseId`
- `GET /progress/courses/:courseId` — authenticated course progress.
- `POST /progress/course-entries/:entryId/complete` — complete an article entry.
- `POST /progress/course-entries/:entryId/attempt` — submit a `fill_gap_choice` attempt.

## Environment

- `PORT` (default `8002`)
- `DATABASE_URL`
- `KAFKA_BROKERS` (default `localhost:9092`)
- `COURSE_EVENTS_TOPIC` (default `content.course-events`)
- `KAFKA_GROUP_ID` (default `exercise-service-content-registry`)
