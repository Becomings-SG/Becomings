import type { Env, VisionMealEstimate } from "./types";

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          vision_food_name: { type: "string" },
          description: { type: "string" },
          estimated_edible_grams: { type: ["number", "null"] },
          portion_confidence: { type: "string", enum: ["low", "medium", "high"] },
          portion_assumptions: { type: "array", items: { type: "string" } },
          clarification_needed: { type: "array", items: { type: "string" } }
        },
        required: [
          "vision_food_name",
          "description",
          "estimated_edible_grams",
          "portion_confidence",
          "portion_assumptions",
          "clarification_needed"
        ]
      }
    },
    image_limitations: { type: "array", items: { type: "string" } },
    overall_confidence: { type: "string", enum: ["low", "medium", "high"] }
  },
  required: ["items", "image_limitations", "overall_confidence"]
};

function extractResponseText(payload: any): string {
  for (const output of payload.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  throw new Error("OPENAI_VISION_EMPTY_RESPONSE");
}

/**
 * Vision is deliberately restricted to identifying visible foods and estimating
 * edible gram weights. It must not invent nutrient values. Nutrients are obtained
 * only after a dietitian selects a traceable database record.
 */
export async function estimateFoodsFromPhoto(
  imageDataUrl: string,
  env: Env,
  mealContext?: string,
): Promise<VisionMealEstimate> {
  if (!imageDataUrl.startsWith("data:image/jpeg;base64,") &&
      !imageDataUrl.startsWith("data:image/png;base64,") &&
      !imageDataUrl.startsWith("data:image/webp;base64,")) {
    throw new Error("IMAGE_DATA_URL_TYPE_NOT_SUPPORTED");
  }

  const prompt = [
    "You are assisting a registered dietitian with food-photo documentation.",
    "Identify only foods that are reasonably visible in this image.",
    "Estimate edible portion weight in grams for each visible item.",
    "Do not estimate calories, macros, micronutrients, sodium, potassium or phosphorus.",
    "Do not assume ingredients, oil, sauces, sugar, salt or cooking methods that cannot be seen.",
    "For mixed dishes, describe visible components separately only when reasonably distinguishable.",
    "If a portion cannot be estimated responsibly, return null grams and explain what needs clarification.",
    "Do not infer food identity from a person's identity or health status.",
    "Include uncertainty and practical questions that would improve the estimate.",
    mealContext ? `Client-provided meal context: ${mealContext}` : ""
  ].filter(Boolean).join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageDataUrl, detail: "high" }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "becomings_food_photo_estimate",
          strict: true,
          schema: RESPONSE_SCHEMA
        }
      }
    })
  });

  if (!response.ok) {
    // Do not expose provider response bodies or client image data in logs.
    throw new Error(`OPENAI_VISION_HTTP_${response.status}`);
  }

  const payload = await response.json() as any;
  const parsed = JSON.parse(extractResponseText(payload)) as VisionMealEstimate;

  for (const item of parsed.items) {
    if (item.estimated_edible_grams !== null &&
        (!Number.isFinite(item.estimated_edible_grams) ||
         item.estimated_edible_grams <= 0 ||
         item.estimated_edible_grams > 3000)) {
      throw new Error("VISION_PORTION_OUT_OF_RANGE");
    }
  }
  return parsed;
}
