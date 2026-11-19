import {
  NUTRIENT_UNITS,
  type CalculatedNutrient,
  type NutrientCode,
  type NutrientValuesPer100g
} from "./types";

/**
 * Calculate nutrient amounts from source values expressed per 100 g edible portion.
 * Missing source values remain null; they are never silently converted to zero.
 */
export function calculateNutrients(
  values: NutrientValuesPer100g,
  edibleGrams: number
): CalculatedNutrient[] {
  if (!Number.isFinite(edibleGrams) || edibleGrams < 0 || edibleGrams > 5000) {
    throw new Error("INVALID_EDIBLE_GRAMS");
  }

  const codes = Object.keys(NUTRIENT_UNITS) as NutrientCode[];
  return codes.map((code) => {
    const per100 = values[code];
    const available = typeof per100 === "number" && Number.isFinite(per100);
    return {
      code,
      unit: NUTRIENT_UNITS[code],
      amount_per_100g: available ? per100 : null,
      estimated_amount: available ? (per100 * edibleGrams) / 100 : null,
      status: available ? "available" : "missing"
    };
  });
}

export function sumMealNutrients(
  items: Array<{ nutrients: CalculatedNutrient[] }>
): Array<{
  code: NutrientCode;
  unit: string;
  amount: number | null;
  completeness: "complete" | "partial" | "unavailable";
}> {
  const codes = Object.keys(NUTRIENT_UNITS) as NutrientCode[];
  return codes.map((code) => {
    const values = items.map((item) => item.nutrients.find((n) => n.code === code));
    const available = values.filter((n) => n?.estimated_amount !== null && n?.estimated_amount !== undefined);
    const missingCount = values.length - available.length;
    return {
      code,
      unit: NUTRIENT_UNITS[code],
      amount: available.length ? available.reduce((sum, n) => sum + n!.estimated_amount!, 0) : null,
      completeness: available.length === 0
        ? "unavailable"
        : missingCount > 0 ? "partial" : "complete"
    };
  });
}
