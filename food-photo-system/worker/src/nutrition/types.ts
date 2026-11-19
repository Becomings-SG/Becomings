export const NUTRIENT_UNITS = {
  energy_kcal: "kcal",
  carbohydrate_g: "g",
  protein_g: "g",
  total_fat_g: "g",
  fibre_g: "g",
  saturated_fat_g: "g",
  total_sugars_g: "g",
  sodium_mg: "mg",
  potassium_mg: "mg",
  phosphorus_mg: "mg",
} as const;

export type NutrientCode = keyof typeof NUTRIENT_UNITS;
export type PortionConfidence = "low" | "medium" | "high";

export interface VisionFoodItem {
  vision_food_name: string;
  description: string;
  estimated_edible_grams: number | null;
  portion_confidence: PortionConfidence;
  portion_assumptions: string[];
  clarification_needed: string[];
}

export interface VisionMealEstimate {
  items: VisionFoodItem[];
  image_limitations: string[];
  overall_confidence: PortionConfidence;
}

export interface NutrientValuesPer100g {
  energy_kcal?: number | null;
  carbohydrate_g?: number | null;
  protein_g?: number | null;
  total_fat_g?: number | null;
  fibre_g?: number | null;
  saturated_fat_g?: number | null;
  total_sugars_g?: number | null;
  sodium_mg?: number | null;
  potassium_mg?: number | null;
  phosphorus_mg?: number | null;
}

export interface FoodDatabaseMatch {
  source: "USDA_FDC" | "SG_FOODID" | "MYFCD" | "CUSTOM";
  source_food_id: string;
  food_name: string;
  data_type?: string;
  nutrients_per_100g: NutrientValuesPer100g;
  licence_label: string;
  source_url?: string;
  match_note?: string;
}

export interface CalculatedNutrient {
  code: NutrientCode;
  unit: string;
  amount_per_100g: number | null;
  estimated_amount: number | null;
  status: "available" | "missing";
}

export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_VISION_MODEL?: string;
  USDA_FDC_API_KEY: string;
}
