CREATE TABLE synced_movies (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_ms INTEGER,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT synced_movies_duration_positive CHECK (duration_ms IS NULL OR duration_ms > 0)
);

CREATE TABLE synced_movie_clips (
  id UUID PRIMARY KEY,
  movie_id UUID NOT NULL REFERENCES synced_movies(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  CONSTRAINT synced_movie_clips_position_nonnegative CHECK (position >= 0),
  CONSTRAINT synced_movie_clips_range_valid CHECK (start_ms >= 0 AND end_ms > start_ms),
  CONSTRAINT synced_movie_clips_movie_position_key UNIQUE (movie_id, position)
);

CREATE INDEX synced_movie_clips_movie_start_idx
  ON synced_movie_clips(movie_id, start_ms);

CREATE TABLE clip_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  clip_id UUID NOT NULL REFERENCES synced_movie_clips(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clip_studies_user_clip_key UNIQUE (user_id, clip_id)
);

CREATE INDEX clip_studies_user_started_idx
  ON clip_studies(user_id, started_at DESC);
