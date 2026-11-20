import { parseSgFoodIdComparisonCsv, type SgFoodIdFoodRecord } from "./sgfoodid-csv";

export interface SgFoodIdEnv {
  DB: D1Database;
  SG_FOODID_IMPORT_TOKEN: string;
}

function normalizeName(value: string): string {
  return value.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function recordId(record: SgFoodIdFoodRecord): Promise<string> {
  const key = [record.sourceRecordName, record.sourceDataType ?? "", record.lastUpdated ?? ""].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return "SGFID-" + hex.slice(0, 32);
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export async function importSgFoodIdCsv(
  csv: string,
  env: SgFoodIdEnv,
): Promise<{ imported: number; batchId: string; records: string[] }> {
  const records = parseSgFoodIdComparisonCsv(csv);
  if (!records.length) throw new Error("NO_FOOD_RECORDS");
  if (records.length > 100) throw new Error("IMPORT_BATCH_TOO_LARGE");

  const batchId = crypto.randomUUID();
  const statements = await Promise.all(records.map(async (record) => {
    const id = await recordId(record);
    return env.DB.prepare(`
      INSERT INTO sgfoodid_food_records (
        source_record_id, food_name, normalized_name, source_data_type,
        last_updated, default_serving_json, per_100g_json, per_serving_json,
        original_record_json, import_batch_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_record_id) DO UPDATE SET
        food_name=excluded.food_name,
        normalized_name=excluded.normalized_name,
        source_data_type=excluded.source_data_type,
        last_updated=excluded.last_updated,
        default_serving_json=excluded.default_serving_json,
        per_100g_json=excluded.per_100g_json,
        per_serving_json=excluded.per_serving_json,
        original_record_json=excluded.original_record_json,
        import_batch_id=excluded.import_batch_id,
        imported_at=datetime('now')
    `).bind(
      id, record.sourceRecordName, normalizeName(record.sourceRecordName),
      record.sourceDataType, record.lastUpdated,
      record.defaultServing ? json(record.defaultServing) : null,
      json(record.per100g), json(record.perServing), json(record), batchId,
    );
  }));

  await env.DB.batch(statements);
  return { imported: records.length, batchId, records: records.map((r) => r.sourceRecordName) };
}

export async function searchSgFoodId(
  query: string,
  env: Pick<SgFoodIdEnv, "DB">,
  limit = 10,
): Promise<Array<Record<string, unknown>>> {
  const normalized = normalizeName(query);
  if (normalized.length < 2) return [];
  const words = normalized.split(" ").filter(Boolean).slice(0, 6);
  const where = words.map(() => "normalized_name LIKE ?").join(" AND ");
  const bindings = words.map((word) => `%${word}%`);
  const result = await env.DB.prepare(`
    SELECT source_record_id, food_name, source_data_type, last_updated,
      default_serving_json, per_100g_json, per_serving_json, source_label, source_url
    FROM sgfoodid_food_records
    WHERE ${where}
    ORDER BY
      CASE WHEN normalized_name = ? THEN 0
           WHEN normalized_name LIKE ? THEN 1 ELSE 2 END,
      CASE source_data_type WHEN 'Lab Analysis' THEN 0 WHEN 'Derived' THEN 1
           WHEN 'Borrowed' THEN 2 ELSE 3 END,
      COALESCE(last_updated, '0000') DESC
    LIMIT ?
  `).bind(...bindings, normalized, `${normalized}%`, Math.max(1, Math.min(limit, 20))).all();

  return (result.results ?? []).map((row) => ({
    ...row,
    default_serving: row.default_serving_json ? JSON.parse(String(row.default_serving_json)) : null,
    nutrients_per_100g: JSON.parse(String(row.per_100g_json)),
    nutrients_per_serving: JSON.parse(String(row.per_serving_json)),
    default_serving_json: undefined,
    per_100g_json: undefined,
    per_serving_json: undefined,
  }));
}
