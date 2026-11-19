PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meal_item_portion_history (
  history_id TEXT PRIMARY KEY,
  meal_item_id TEXT NOT NULL,
  previous_quantity REAL,
  previous_unit TEXT,
  previous_reference_grams REAL,
  previous_edible_grams REAL,
  new_quantity REAL,
  new_unit TEXT,
  new_reference_grams REAL,
  new_edible_grams REAL,
  change_source TEXT NOT NULL CHECK (
    change_source IN ('ai_estimate', 'dietitian_edit_quantity', 'dietitian_edit_grams', 'dietitian_change_reference', 'system_import')
  ),
  change_reason TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (meal_item_id) REFERENCES meal_items(meal_item_id)
);

CREATE INDEX IF NOT EXISTS idx_portion_history_item_time
  ON meal_item_portion_history(meal_item_id, changed_at);

CREATE TABLE IF NOT EXISTS meal_review_events (
  event_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN ('food_match_selected', 'portion_amended', 'nutrients_recalculated', 'approved', 'rejected', 'returned_for_correction')
  ),
  actor_id TEXT,
  notes TEXT,
  event_details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES food_photo_submissions(submission_id)
);

CREATE INDEX IF NOT EXISTS idx_meal_review_events_submission
  ON meal_review_events(submission_id, created_at);
