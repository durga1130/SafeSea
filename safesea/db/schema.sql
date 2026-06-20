-- ════════════════════════════════════════════════════════════
-- SafeSea — PostgreSQL schema
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('fisherman','crew','admin')),
  fullname      TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  phone         TEXT,
  vessel        TEXT,
  nationality   TEXT DEFAULT 'IND',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vessels (
  id          SERIAL PRIMARY KEY,
  vessel_id   TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lon         DOUBLE PRECISION NOT NULL,
  spd         DOUBLE PRECISION NOT NULL DEFAULT 0,
  dist        DOUBLE PRECISION NOT NULL DEFAULT 0,
  risk        INTEGER NOT NULL DEFAULT 0,
  zone        TEXT NOT NULL DEFAULT 'safe' CHECK (zone IN ('safe','warning','danger')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  type        TEXT NOT NULL,
  ico         TEXT NOT NULL,
  bg          TEXT NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  time_label  TEXT NOT NULL,
  unread      BOOLEAN NOT NULL DEFAULT true,
  is_sos      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  sender_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  from_email      TEXT NOT NULL,
  from_name       TEXT,
  to_email        TEXT NOT NULL,
  vessel          TEXT,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'info',
  unread          BOOLEAN NOT NULL DEFAULT true,
  reply_to_email  TEXT,
  parent_id       INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  reply_text      TEXT,
  replied         BOOLEAN NOT NULL DEFAULT false,
  time_label      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sos_events (
  id          SERIAL PRIMARY KEY,
  vessel      TEXT,
  user_email  TEXT,
  lat         DOUBLE PRECISION,
  lon         DOUBLE PRECISION,
  risk        INTEGER,
  zone        TEXT,
  body        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_to   ON messages (to_email);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages (from_email);
