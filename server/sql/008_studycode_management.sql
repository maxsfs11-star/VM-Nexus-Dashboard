ALTER TABLE studycode_users
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS studycode_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studycode_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES studycode_tracks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studycode_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES studycode_modules(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studycode_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES studycode_lessons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  statement TEXT,
  difficulty TEXT NOT NULL DEFAULT 'beginner',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE studycode_users
  ADD COLUMN IF NOT EXISTS current_track_id UUID REFERENCES studycode_tracks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES nexus_plans(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS studycode_lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES studycode_users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES studycode_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS studycode_ai_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES studycode_users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studycode_coin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES studycode_users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studycode_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES studycode_users(id) ON DELETE CASCADE,
  track_id UUID REFERENCES studycode_tracks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  certificate_code TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'revoked'))
);

CREATE TABLE IF NOT EXISTS studycode_community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES studycode_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'community',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'archived')),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studycode_community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES studycode_community_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES studycode_users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studycode_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES studycode_users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'suggestion' CHECK (type IN ('complaint', 'suggestion', 'report')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studycode_users_last_active_idx ON studycode_users(last_active_at DESC);
CREATE INDEX IF NOT EXISTS studycode_ai_questions_user_idx ON studycode_ai_questions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS studycode_community_posts_created_idx ON studycode_community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS studycode_feedback_status_idx ON studycode_feedback(status, created_at DESC);
