-- Add the local word registry, SRS cards, and word learning preferences.

CREATE TABLE synced_word_categories (
  slug TEXT PRIMARY KEY,
  name_ru TEXT,
  name_en TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE synced_words (
  id UUID PRIMARY KEY,
  word TEXT NOT NULL,
  translation TEXT NOT NULL,
  transcription TEXT,
  examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  categories TEXT[] NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX synced_words_categories_idx ON synced_words USING GIN (categories);

CREATE TABLE srs_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'learning' CHECK (status IN ('learning', 'learned', 'known')),
  stage INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_answer_wrong BOOLEAN NOT NULL DEFAULT false,
  next_review_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT srs_cards_user_subject_key UNIQUE (user_id, subject_type, subject_id)
);

CREATE INDEX srs_cards_user_status_next_review_idx
  ON srs_cards(user_id, status, next_review_at);

CREATE TABLE word_learning_preferences (
  user_id UUID PRIMARY KEY,
  category_slugs TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
