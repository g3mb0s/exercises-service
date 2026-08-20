# Course publication Kafka contract

## Transport

- Topic: `content.course-events`
- Message key: course UUID
- Event type: `content.course.published`
- Contract version: `1`

## Payload

```json
{
  "eventId": "11111111-1111-4111-8111-111111111111",
  "type": "content.course.published",
  "version": 1,
  "occurredAt": "2026-07-21T12:00:00.000Z",
  "course": {
    "id": "22222222-2222-4222-8222-222222222222",
    "slug": "english-basics",
    "publishedAt": "2026-07-21T12:00:00.000Z",
    "sections": [
      {
        "id": "33333333-3333-4333-8333-333333333333",
        "position": 0,
        "units": [
          {
            "id": "44444444-4444-4444-8444-444444444444",
            "position": 0,
            "entries": [
              {
                "id": "55555555-5555-4555-8555-555555555555",
                "position": 0,
                "contentType": "article",
                "contentId": "66666666-6666-4666-8666-666666666666"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

`content_service` writes this payload to its transactional outbox in the same database transaction that publishes the course. `exercise_service` replaces the corresponding local snapshot in one transaction and records `eventId`; duplicate delivery is a no-op.

# Movie lifecycle Kafka contract

## Transport

- Topic: `content.movie-events`
- Message key: movie UUID
- Contract version: `1`

## Ready movie

Event type `content.movie.processing.completed` is published after HLS, subtitles, and clips are committed. The payload contains the movie UUID, duration, and clip count. `exercise_service` uses the UUID to fetch the canonical ready-movie snapshot from `content_service`, then transactionally replaces its local movie and clip registry and records `eventId`.

## Deleted or unavailable movie

Event types `content.movie.deleted` and `content.movie.processing.failed` remove the corresponding local movie snapshot. The cascading foreign keys remove clip-study rows that can no longer reference a playable clip. Duplicate events are ignored through `processed_events`.

# Word lifecycle Kafka contract

## Transport

- Topic: `content.words-events`
- Message key: word UUID
- Contract version: `1`

## Published word

Event type `content.word.published` is emitted every time a word is or stays published: on create, on update of a published word, when a draft/archived word is published, per bulk item, and per imported word. The payload contains only the word UUID:

```json
{
  "eventId": "11111111-1111-4111-8111-111111111111",
  "type": "content.word.published",
  "version": 1,
  "occurredAt": "2026-08-20T12:00:00.000Z",
  "word": {
    "id": "22222222-2222-4222-8222-222222222222"
  }
}
```

`exercise_service` fetches the canonical published snapshot from `content_service` (`GET /words/:id`) and transactionally upserts the local `synced_words` row plus the referenced `synced_word_categories`, then records `eventId` in `processed_events`. If the fetch returns 404 the local row is deleted. Duplicate delivery is a no-op.

## Deleted or unpublished word

Event type `content.word.deleted` is emitted both when a published word is physically deleted and when it is moved out of the published state (draft/archived). The payload mirrors the published event with `"type": "content.word.deleted"`. `exercise_service` deletes the local word snapshot and every `srs_cards` row for `subject_type = 'word'` with that subject id in one transaction, then records the event. Events are consumed with `fromBeginning: true`; re-running `POST /words/import` in `content_service` re-publishes every imported word.
