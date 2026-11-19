import type {
  Env,
  FoodDatabaseMatch,
  NutrientValuesPer100g
} from "./types";

const FDC_NUTRIENT_NUMBERS: Record<string, keyof NutrientValuesPer100g> = {
  "1008": "energy_kcal",
  "1003": "protein_g",
  "1004": "total_fat_g",
  "1005": "carbohydrate_g",
  "1079": "fibre_g",
  "2000": "total_sugars_g",
  "1258": "saturated_fat_g",
  "1093": "sodium_mg",
  "1092": "potassium_mg",
  "1091": "phosphorus_mg"
};

type FdcNutrient = {
  nutrient?: { number?: string; id?: number; name?: string; unitName?: string };
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  amount?: number;
  value?: number;
};

type FdcFood = {
  fdcId: number;
  description: string;
  dataType?: string;
  foodNutrients?: FdcNutrient[];
};

function nutrientNumber(item: FdcNutrient): string | undefined {
  return item.nutrient?.number ?? item.nutrientNumber ??
    (item.nutrient?.id !== undefined ? String(item.nutrient.id) : undefined);
}

function nutrientUnit(item: FdcNutrient): string {
  return (item.nutrient?.unitName ?? item.unitName ?? "").toLowerCase();
}

function toTargetUnit(
  code: keyof NutrientValuesPer100g,
  amount: number,
  unit: string
): number | null {
  if (!Number.isFinite(amount)) return null;
  if (code === "energy_kcal") {
    if (unit === "kcal") return amount;
    if (unit === "kj") return amount / 4.184;
    return null;
  }
  if (["sodium_mg", "potassium_mg", "phosphorus_mg"].includes(code)) {
    if (unit === "mg") return amount;
    if (unit === "µg" || unit === "ug") return amount / 1000;
    if (unit === "g") return amount * 1000;
    return null;
  }
  if (unit === "g") return amount;
  if (unit === "mg") return amount / 1000;
  return null;
}

function normalizeNutrients(items: FdcNutrient[] = []): NutrientValuesPer100g {
  const result: NutrientValuesPer100g = {};
  for (const item of items) {
    const number = nutrientNumber(item);
    const code = number ? FDC_NUTRIENT_NUMBERS[number] : undefined;
    const amount = item.amount ?? item.value;
    if (!code || typeof amount !== "number") continue;
    const value = toTargetUnit(code, amount, nutrientUnit(item));
    if (value !== null) result[code] = value;
  }
  return result;
}

async function fdcFetch<T>(url: string, env: Env): Promise<T> {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(
    `${url}${separator}api_key=${encodeURIComponent(env.USDA_FDC_API_KEY)}`
  );
  if (!response.ok) throw new Error(`USDA_FDC_HTTP_${response.status}`);
  return await response.json() as T;
}

export async function searchUsdaFoods(
  query: string,
  env: Env,
  pageSize = 8
): Promise<FoodDatabaseMatch[]> {
  const cleanQuery = query.trim().slice(0, 120);
  if (!cleanQuery) return [];
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("query", cleanQuery);
  url.searchParams.set("pageSize", String(Math.min(Math.max(pageSize, 1), 20)));
  url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS)");

  const result = await fdcFetch<{ foods?: FdcFood[] }>(url.toString(), env);
  return (result.foods ?? []).map((food) => ({
    source: "USDA_FDC",
    source_food_id: String(food.fdcId),
    food_name: food.description,
    data_type: food.dataType,
    nutrients_per_100g: normalizeNutrients(food.foodNutrients),
    licence_label: "CC0-1.0",
    source_url: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`,
    match_note: "Search result only. Dietitian must confirm food identity and preparation."
  }));
}

export async function getUsdaFood(
  fdcId: string,
  env: Env
): Promise<FoodDatabaseMatch> {
  if (!/^\d+$/.test(fdcId)) throw new Error("INVALID_FDC_ID");
  const food = await fdcFetch<FdcFood>(
    `https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(fdcId)}?format=full`,
    env
  );
  return {
    source: "USDA_FDC",
    source_food_id: String(food.fdcId),
    food_name: food.description,
    data_type: food.dataType,
    nutrients_per_100g: normalizeNutrients(food.foodNutrients),
    licence_label: "CC0-1.0",
    source_url: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`,
    match_note: "Confirm food state, preparation and edible portion before calculation."
  };
}
