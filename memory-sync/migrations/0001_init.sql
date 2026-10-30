-- Memory records are opt-in. This migration imports NO personal/private data.
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  project TEXT NOT NULL DEFAULT '全域',
  layer TEXT NOT NULL DEFAULT 'fact',
  source TEXT NOT NULL,
  source_url TEXT,
  event_at TEXT,
  approval TEXT NOT NULL DEFAULT 'pending' CHECK(approval IN ('pending','approved','rejected')),
  verification TEXT NOT NULL DEFAULT 'unverified' CHECK(verification IN ('unverified','verified')),
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
CREATE INDEX IF NOT EXISTS idx_memories_approval ON memories(approval);
CREATE TABLE IF NOT EXISTS sync_runs (
  run_id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  state TEXT NOT NULL DEFAULT 'running',
  summary_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON sync_runs(started_at DESC);
-- Reserved for future, explicitly authorized writeback. Never infer a link from title alone.
CREATE TABLE IF NOT EXISTS sync_links (
  provider TEXT NOT NULL CHECK(provider IN ('google_drive','notion')),
  memory_id TEXT NOT NULL,
  remote_id TEXT NOT NULL,
  last_fingerprint TEXT,
  verified_at TEXT,
  PRIMARY KEY(provider, memory_id),
  UNIQUE(provider, remote_id),
  FOREIGN KEY(memory_id) REFERENCES memories(id)
);
