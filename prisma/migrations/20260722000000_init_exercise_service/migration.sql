CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE synced_courses (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE course_content_items (
  row_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES synced_courses(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('section', 'unit', 'entry')),
  parent_item_id UUID,
  position INTEGER NOT NULL,
  referenced_content_id UUID,
  referenced_type TEXT CHECK (referenced_type IN ('article', 'exercise')),
  UNIQUE (course_id, item_type, item_id),
  CHECK (
    (item_type = 'entry' AND referenced_content_id IS NOT NULL AND referenced_type IS NOT NULL)
    OR (item_type <> 'entry' AND referenced_content_id IS NULL AND referenced_type IS NULL)
  )
);

CREATE TABLE content_references (
  row_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES synced_courses(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('article', 'exercise')),
  content_id UUID NOT NULL,
  UNIQUE (course_id, content_type, content_id)
);

CREATE TABLE processed_events (
  event_id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE course_item_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_id UUID NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('course', 'section', 'unit', 'entry')),
  is_completed BOOLEAN NOT NULL DEFAULT false,
  was_failed BOOLEAN NOT NULL DEFAULT false,
  was_fail_fixed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_type, item_id)
);

CREATE INDEX course_content_items_parent_idx ON course_content_items(course_id, parent_item_id);
CREATE INDEX course_content_items_reference_idx ON course_content_items(referenced_type, referenced_content_id);
CREATE INDEX content_references_content_idx ON content_references(content_type, content_id);
CREATE INDEX course_item_progress_user_idx ON course_item_progress(user_id);
