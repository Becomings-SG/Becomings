PRAGMA foreign_keys = ON;

-- HPB SG FoodID records imported from user-exported comparison CSV files.
-- Keep the complete source payload so source terminology and nutrient statuses
-- remain recoverable even when the application maps common nutrients.
CREATE TABLE IF NOT EXISTS sgfoodid_food_records (
  source_record_id TEXT PRIMARY KEY,
  food_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  source_data_type TEXT,
  last_updated TEXT,
  default_serving_json TEXT,
  per_100g_json TEXT NOT NULL,
  per_serving_json TEXT NOT NULL,
  original_record_json TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  source_label TEXT NOT NULL DEFAULT 'HPB SG FoodID',
  source_url TEXT NOT NULL DEFAULT 'https://pphtpc.hpb.gov.sg/web/sgfoodid/tools/food-search',
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(food_name, source_data_type, last_updated)
);

CREATE INDEX IF NOT EXISTS idx_sgfoodid_normalized_name
  ON sgfoodid_food_records(normalized_name);
CREATE INDEX IF NOT EXISTS idx_sgfoodid_name
  ON sgfoodid_food_records(food_name);
