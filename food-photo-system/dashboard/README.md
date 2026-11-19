# Dietitian meal-review dashboard prototype

Open `index.html` locally in a browser to inspect the proposed review workflow.

## Included in this prototype

- Synthetic chicken-rice example only; no real client or database records.
- Editable household portion quantity and edible gram weight.
- Two-way conversion using a serving reference (e.g. 1 share = 200 g).
- Changing the reference gram weight recalculates grams while preserving the selected portion quantity.
- Live illustrative nutrient recalculation.
- Expandable source record inspection area showing source name, record ID, description, serving reference and per-100-g nutrient composition.
- Add/remove food components.
- Demonstration-only approve/reject controls.

## Important limitations

This is a front-end interaction prototype, not a deployed or connected dashboard. Its food descriptions and nutrient values are invented demonstration values, not SG FoodID, MyFCD or USDA data. Approval does not save anything. Do not use it for clinical decisions or enter client data.

## Production integration requirements

Before this UI can access client records:
1. Put the dashboard behind Cloudflare Access or equivalent strong authentication and verify identity/role server-side.
2. Add authenticated API routes for pending meals, original private Drive images, analysis records, food search/detail, portion edits, nutrient recalculation and approval.
3. Use D1 prepared statements and enforce client/dietitian access boundaries server-side.
4. Keep original source records immutable; store dietitian selections and amendments separately.
5. Write every portion edit and approval to the audit tables in migration `0004_portion_audit.sql`.
6. Never expose Drive credentials, OpenAI keys, USDA keys or provider tokens to the browser.
7. Do not return or approve any client-facing summary until the dietitian approval is saved successfully.
8. Validate all nutrient source fields, units, portion conversions and calculations with automated tests before clinical use.
