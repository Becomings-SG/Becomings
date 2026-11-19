PRAGMA foreign_keys = ON;

-- Client identity is pseudonymous. Store an HMAC of the WhatsApp sender ID,
-- not the raw phone number. Client contact details belong in a separately
-- protected system if they are required for operations.

CREATE TABLE IF NOT EXISTS clients (
  client_code TEXT PRIMARY KEY,
  whatsapp_sender_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_consents (
  consent_id TEXT PRIMARY KEY,
  client_code TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  purposes_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('granted', 'withdrawn')),
  consented_at TEXT,
  withdrawn_at TEXT,
  FOREIGN KEY (client_code) REFERENCES clients(client_code)
);

CREATE TABLE IF NOT EXISTS food_photo_submissions (
  submission_id TEXT PRIMARY KEY,
  client_code TEXT NOT NULL,
  whatsapp_message_id TEXT NOT NULL UNIQUE,
  submitted_at TEXT NOT NULL,
  meal_type TEXT CHECK (
    meal_type IS NULL OR meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'other')
  ),
  caption TEXT,
  drive_file_id TEXT,
  drive_web_view_link TEXT,
  processing_status TEXT NOT NULL DEFAULT 'received' CHECK (
    processing_status IN (
      'received', 'queued', 'stored', 'analysed',
      'needs_review', 'failed', 'deleted'
    )
  ),
  failure_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_code) REFERENCES clients(client_code)
);

CREATE INDEX IF NOT EXISTS idx_food_photo_client_date
  ON food_photo_submissions(client_code, submitted_at);

CREATE INDEX IF NOT EXISTS idx_food_photo_status
  ON food_photo_submissions(processing_status);

CREATE TABLE IF NOT EXISTS meal_analyses (
  analysis_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  model_name TEXT NOT NULL,
  foods_json TEXT NOT NULL,
  energy_kcal REAL,
  carbohydrate_g REAL,
  protein_g REAL,
  fat_g REAL,
  fibre_g REAL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  uncertainty_notes_json TEXT NOT NULL DEFAULT '[]',
  dietitian_review_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    dietitian_review_status IN ('pending', 'approved', 'amended', 'rejected')
  ),
  dietitian_notes TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES food_photo_submissions(submission_id)
);

CREATE TABLE IF NOT EXISTS daily_summaries (
  summary_id TEXT PRIMARY KEY,
  client_code TEXT NOT NULL,
  summary_date TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    review_status IN ('pending', 'approved', 'amended', 'rejected')
  ),
  dietitian_notes TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_code, summary_date),
  FOREIGN KEY (client_code) REFERENCES clients(client_code)
);
