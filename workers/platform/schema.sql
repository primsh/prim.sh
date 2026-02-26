CREATE TABLE IF NOT EXISTS access_requests (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  redeemed_by TEXT,
  redeemed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
