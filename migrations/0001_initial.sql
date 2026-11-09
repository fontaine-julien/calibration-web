PRAGMA foreign_keys = ON;
CREATE TABLE protocols (
  id TEXT PRIMARY KEY,
  items_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0,1))
);
CREATE INDEX invitations_expiry ON invitations(expires_at);
CREATE TABLE participants (
  id TEXT PRIMARY KEY REFERENCES invitations(id) ON DELETE CASCADE,
  protocol_id TEXT NOT NULL REFERENCES protocols(id),
  token_hash TEXT NOT NULL UNIQUE,
  rights_hash TEXT NOT NULL UNIQUE,
  consent_version TEXT NOT NULL,
  consent_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  retention_days INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ready','active','pause','completed','interrupted')),
  next_index INTEGER NOT NULL DEFAULT 0,
  nonce TEXT,
  served_at INTEGER,
  pause_at INTEGER,
  pause_ms INTEGER,
  ended_at INTEGER,
  interruption TEXT
);
CREATE INDEX participants_expiry ON participants(expires_at);
-- Minimal deletion ledger so the owner can also remove earlier CSV exports.
-- No response, credential, name or email is retained here.
CREATE TABLE erasures (
  participant_id TEXT PRIMARY KEY,
  requested_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE trials (
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  item_index INTEGER NOT NULL,
  pair_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  a INTEGER NOT NULL,
  b INTEGER NOT NULL,
  expected TEXT NOT NULL,
  answer TEXT NOT NULL,
  correct INTEGER NOT NULL,
  first_ms REAL NOT NULL,
  last_ms REAL NOT NULL,
  enter_ms REAL NOT NULL,
  corrections INTEGER NOT NULL,
  events_json TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (participant_id, item_index)
);
