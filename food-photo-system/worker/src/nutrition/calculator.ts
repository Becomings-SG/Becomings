import {
  NUTRIENT_UNITS,
  type CalculatedNutrient,
  type NutrientCode,
  type NutrientValuesPer100g,
  type PortionSelection
} from "./types";

/**
 * Convert a human serving description into edible grams.
 * The source's per-100-g nutrient basis remains unchanged for traceability.
 */
export function resolvePortionGrams(portion: PortionSelection): number {
  if (portion.actual_edible_grams !== undefined) {
    if (!Number.isFinite(portion.actual_edible_grams) ||
        portion.actual_edible_grams < 0 ||
        portion.actual_edible_grams > 5000) {
      throw new Error("INVALID_ACTUAL_EDIBLE_GRAMS");
    }
    return portion.actual_edible_grams;
  }

  if (!Number.isFinite(portion.quantity) || portion.quantity < 0 || portion.quantity > 100) {
    throw new Error("INVALID_PORTION_QUANTITY");
  }

  if (portion.unit === "gram") return portion.quantity;

  const referenceGrams = portion.reference_grams_per_unit;
  if (typeof referenceGrams !== "number" ||
      !Number.isFinite(referenceGrams) ||
      referenceGrams <= 0 ||
      referenceGrams > 5000) {
    throw new Error("PORTION_REFERENCE_GRAMS_REQUIRED");
  }

  return portion.quantity * referenceGrams;
}

/**
 * Nutrient composition is stored per 100 g edible portion.
 * User-facing quantities can be servings, shares, bowls, pieces, etc.
 * Missing source values remain null, never zero.
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

export function calculatePortionNutrients(
  values: NutrientValuesPer100g,
  portion: PortionSelection
): { edible_grams: number; nutrients: CalculatedNutrient[] } {
  const edible_grams = resolvePortionGrams(portion);
  return { edible_grams, nutrients: calculateNutrients(values, edible_grams) };
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
