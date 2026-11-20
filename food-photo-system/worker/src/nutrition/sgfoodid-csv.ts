/**
 * SG FoodID comparison-export CSV parser.
 *
 * Imports only files manually exported by the user from HPB SG FoodID.
 * This does not scrape the SG FoodID website or assume a public API.
 * Source strings such as "-", "Trace" and blank cells are preserved distinctly.
 */

export type SgFoodIdNutrientValue =
  | { status: "value"; value: number; raw: string }
  | { status: "trace"; raw: string }
  | { status: "not_reported"; raw: string }
  | { status: "blank"; raw: string };

export interface SgFoodIdServing {
  raw: string;
  quantity: number | null;
  unit: string | null;
  grams: number | null;
  millilitres: number | null;
}

export interface SgFoodIdFoodRecord {
  source: "HPB SG FoodID";
  sourceRecordName: string;
  sourceDataType: string | null;
  lastUpdated: string | null;
  defaultServing: SgFoodIdServing | null;
  per100g: Record<string, SgFoodIdNutrientValue>;
  perServing: Record<string, SgFoodIdNutrientValue>;
  originalExport: "SG FoodID comparison-results CSV";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

function parseNutrient(rawInput: string | undefined): SgFoodIdNutrientValue {
  const raw = (rawInput ?? "").trim();
  if (!raw) return { status: "blank", raw };
  if (/^trace$/i.test(raw)) return { status: "trace", raw };
  if (raw === "-" || /^(n\/a|na)$/i.test(raw)) {
    return { status: "not_reported", raw };
  }
  const value = Number(raw.replace(/,/g, ""));
  if (Number.isFinite(value)) return { status: "value", value, raw };
  return { status: "not_reported", raw };
}

function parseServing(rawInput: string | undefined): SgFoodIdServing | null {
  const raw = (rawInput ?? "").trim();
  if (!raw || raw === "-" || raw.toLowerCase() === "n/a") return null;

  // Examples: "1 tablespoon(s) = 15g", "1 bowl(s) = 250g",
  // "1 shot = 40ml", "1 piece(s) = 115g".
  const match = raw.match(/^\s*(\d+(?:\.\d+)?)\s+(.+?)\s*=\s*(\d+(?:\.\d+)?)\s*(g|ml)\s*$/i);
  if (!match) return { raw, quantity: null, unit: null, grams: null, millilitres: null };

  const quantity = Number(match[1]);
  const unit = match[2].trim().replace(/\(s\)/i, "").trim();
  const amount = Number(match[3]);
  const measure = match[4].toLowerCase();
  return {
    raw,
    quantity,
    unit,
    grams: measure === "g" ? amount : null,
    millilitres: measure === "ml" ? amount : null,
  };
}

const SECTION_100G = "Nutritional Information per 100g";
const SECTION_SERVING = "Nutritional Information per Serving";

export function parseSgFoodIdComparisonCsv(csvText: string): SgFoodIdFoodRecord[] {
  const rows = parseCsv(csvText);
  if (rows.length < 3) throw new Error("CSV is empty or does not look like an SG FoodID comparison export.");

  const header = rows[0];
  if ((header[0] ?? "").trim() !== "Food Name" || header.length < 2) {
    throw new Error("Unrecognised CSV header. Expected first column 'Food Name' and food names in following columns.");
  }

  const names = header.slice(1).map((name) => name.trim());
  const records: SgFoodIdFoodRecord[] = names.map((name) => ({
    source: "HPB SG FoodID",
    sourceRecordName: name,
    sourceDataType: null,
    lastUpdated: null,
    defaultServing: null,
    per100g: {},
    perServing: {},
    originalExport: "SG FoodID comparison-results CSV",
  }));

  let section: "none" | "per100g" | "perServing" = "none";
  for (const row of rows.slice(1)) {
    const label = (row[0] ?? "").trim();
    if (label === SECTION_100G) { section = "per100g"; continue; }
    if (label === SECTION_SERVING) { section = "perServing"; continue; }

    records.forEach((record, index) => {
      const raw = (row[index + 1] ?? "").trim();
      if (label === "Source of Data") record.sourceDataType = raw || null;
      else if (label === "Last Updated") record.lastUpdated = raw || null;
      else if (label === "Default Serving Size") record.defaultServing = parseServing(raw);
      else if (label && section === "per100g") record.per100g[label] = parseNutrient(raw);
      else if (label && section === "perServing") record.perServing[label] = parseNutrient(raw);
    });
  }

  return records;
}
