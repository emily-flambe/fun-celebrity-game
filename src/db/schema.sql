-- Game sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'intro',
  celebrities TEXT NOT NULL,
  current_index INTEGER NOT NULL DEFAULT 0,
  responses TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Index for finding active sessions
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
