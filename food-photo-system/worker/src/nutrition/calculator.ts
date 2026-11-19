import {
  NUTRIENT_UNITS,
  type CalculatedNutrient,
  type NutrientCode,
  type NutrientValuesPer100g,
  type PortionSelection
} from "./types";

/**
 * Portion quantity and edible grams are two representations of one value.
 * A source/dietitian reference gram weight links the two fields.
 */
export interface LinkedPortion {
  quantity: number;
  unit: PortionSelection["unit"];
  grams_per_unit: number;
  edible_grams: number;
  basis: PortionSelection["basis"];
}

function validateNonNegative(value: number, code: string, max: number): void {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(code);
  }
}

export function portionToGrams(
  quantity: number,
  gramsPerUnit: number
): number {
  validateNonNegative(quantity, "INVALID_PORTION_QUANTITY", 100);
  validateNonNegative(gramsPerUnit, "INVALID_GRAMS_PER_UNIT", 5000);
  if (gramsPerUnit === 0) throw new Error("PORTION_REFERENCE_GRAMS_REQUIRED");
  return quantity * gramsPerUnit;
}

export function gramsToPortion(
  edibleGrams: number,
  gramsPerUnit: number
): number {
  validateNonNegative(edibleGrams, "INVALID_ACTUAL_EDIBLE_GRAMS", 5000);
  validateNonNegative(gramsPerUnit, "INVALID_GRAMS_PER_UNIT", 5000);
  if (gramsPerUnit === 0) throw new Error("PORTION_REFERENCE_GRAMS_REQUIRED");
  return edibleGrams / gramsPerUnit;
}

/** User edits household portion quantity; grams are recalculated. */
export function updatePortionQuantity(
  current: LinkedPortion,
  quantity: number
): LinkedPortion {
  const edible_grams = portionToGrams(quantity, current.grams_per_unit);
  return { ...current, quantity, edible_grams };
}

/** Dietitian edits grams; household portion quantity is recalculated. */
export function updateEdibleGrams(
  current: LinkedPortion,
  edibleGrams: number
): LinkedPortion {
  const quantity = gramsToPortion(edibleGrams, current.grams_per_unit);
  return { ...current, quantity, edible_grams: edibleGrams };
}

/**
 * Create a linked portion from a chosen serving reference.
 * The serving reference may be database-provided, measured or dietitian-defined.
 */
export function createLinkedPortion(input: {
  quantity: number;
  unit: PortionSelection["unit"];
  grams_per_unit: number;
  basis: PortionSelection["basis"];
}): LinkedPortion {
  return {
    ...input,
    edible_grams: portionToGrams(input.quantity, input.grams_per_unit)
  };
}

/**
 * Nutrient composition remains on the source's per-100-g edible basis.
 * Missing source values remain null; never silently convert them to zero.
 */
export function calculateNutrients(
  values: NutrientValuesPer100g,
  edibleGrams: number
): CalculatedNutrient[] {
  validateNonNegative(edibleGrams, "INVALID_EDIBLE_GRAMS", 5000);

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

export function calculateLinkedPortionNutrients(
  values: NutrientValuesPer100g,
  portion: LinkedPortion
): { portion: LinkedPortion; nutrients: CalculatedNutrient[] } {
  return {
    portion,
    nutrients: calculateNutrients(values, portion.edible_grams)
  };
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
