CREATE TABLE exercise_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  exercise_id UUID NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  failed_times INTEGER NOT NULL DEFAULT 0,
  completed_times INTEGER NOT NULL DEFAULT 0,
  best_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, exercise_id)
);

CREATE TABLE article_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  article_id UUID NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  exercises_completed_count INTEGER NOT NULL DEFAULT 0,
  exercises_fails_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, article_id)
);

CREATE INDEX exercise_progress_user_idx ON exercise_progress(user_id);
CREATE INDEX article_progress_user_idx ON article_progress(user_id);
