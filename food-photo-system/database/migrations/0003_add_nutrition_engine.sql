PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meal_items (
  meal_item_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  vision_food_name TEXT NOT NULL,
  vision_description TEXT,
  estimated_edible_grams REAL,
  portion_quantity REAL,
  portion_unit TEXT CHECK (
    portion_unit IS NULL OR portion_unit IN (
      'serving', 'share', 'bowl', 'cup', 'piece', 'slice',
      'tablespoon', 'teaspoon', 'gram', 'custom'
    )
  ),
  portion_reference_label TEXT,
  reference_grams_per_unit REAL,
  portion_basis TEXT CHECK (
    portion_basis IS NULL OR portion_basis IN (
      'database', 'dietitian_defined', 'measured', 'estimated'
    )
  ),
  portion_confidence TEXT NOT NULL CHECK (
    portion_confidence IN ('low', 'medium', 'high')
  ),
  portion_assumptions_json TEXT NOT NULL DEFAULT '[]',
  selected_source TEXT,
  selected_source_food_id TEXT,
  selected_food_name TEXT,
  original_food_description TEXT,
  match_status TEXT NOT NULL DEFAULT 'unmatched' CHECK (
    match_status IN ('unmatched', 'candidate_found', 'dietitian_selected', 'custom_food')
  ),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES food_photo_submissions(submission_id)
);

CREATE INDEX IF NOT EXISTS idx_meal_items_submission
  ON meal_items(submission_id);

CREATE TABLE IF NOT EXISTS food_database_cache (
  source TEXT NOT NULL CHECK (source IN ('USDA_FDC', 'SG_FOODID', 'MYFCD', 'CUSTOM')),
  source_food_id TEXT NOT NULL,
  food_name TEXT NOT NULL,
  original_description TEXT,
  data_type TEXT,
  serving_references_json TEXT NOT NULL DEFAULT '[]',
  nutrients_per_100g_json TEXT NOT NULL,
  licence_label TEXT NOT NULL,
  source_url TEXT,
  source_accessed_at TEXT NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source, source_food_id)
);

CREATE TABLE IF NOT EXISTS meal_item_nutrient_results (
  meal_item_id TEXT NOT NULL,
  nutrient_code TEXT NOT NULL,
  amount_per_100g REAL,
  estimated_amount REAL,
  unit TEXT NOT NULL,
  source TEXT NOT NULL,
  source_food_id TEXT NOT NULL,
  portion_quantity REAL,
  portion_unit TEXT,
  reference_grams_per_unit REAL,
  calculation_basis_grams REAL NOT NULL,
  calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (meal_item_id, nutrient_code),
  FOREIGN KEY (meal_item_id) REFERENCES meal_items(meal_item_id)
);

CREATE TABLE IF NOT EXISTS meal_nutrient_totals (
  submission_id TEXT NOT NULL,
  nutrient_code TEXT NOT NULL,
  estimated_amount REAL,
  unit TEXT NOT NULL,
  completeness TEXT NOT NULL CHECK (
    completeness IN ('complete', 'partial', 'unavailable')
  ),
  calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (submission_id, nutrient_code),
  FOREIGN KEY (submission_id) REFERENCES food_photo_submissions(submission_id)
);
