# Becomings Food Photo Monitoring System

This module is intentionally isolated from the existing static Becomings website. The website currently publishes from `outputs/`; this module is not part of that Pages build.

## Confirmed decisions

- Existing Becomings WhatsApp Business number, subject to Meta account eligibility and Coexistence onboarding.
- A new, dedicated Google account for Becomings client photo storage (account creation and OAuth authorisation remain user actions).
- Immediate per-meal AI analysis plus end-of-day summaries.
- Manual dietitian review before findings or recommendations are shared with clients.

## Architecture

1. Meta WhatsApp Cloud API sends signed webhooks to a Cloudflare Worker.
2. The webhook verifies Meta's signature, hashes the sender ID and queues image events.
3. A Cloudflare Queue consumer checks client registration and current consent.
4. The consumer retrieves the WhatsApp media URL, downloads the original image and stores it in the client's private Google Drive folder.
5. D1 records submissions and review status. OpenAI analysis and the dashboard are subsequent tasks.

## Development progress

### Task 1: webhook and schema scaffold

- GET webhook verification and POST signature validation.
- Image-message extraction and queue handoff.
- Initial D1 schema for client mapping, consent, submissions, analyses and daily summaries.

### Task 2: queue consumer and Drive storage scaffold

- Client lookup by pseudonymous sender hash.
- Processing blocked for unknown/inactive clients and clients without current consent.
- WhatsApp media URL retrieval and authenticated media download.
- JPEG/PNG validation and 5 MB size guard.
- OAuth refresh-token flow for Google Drive.
- App-created root and client folders, then original photo upload.
- Idempotency checks using the WhatsApp message ID and deterministic Drive file name.
- Queue retry for transient failures.

This remains a development scaffold. It has not been deployed or integration-tested. No client data has been processed.

### Task 3: nutrition data model and calculation scaffold

- Structured vision output for visible foods and estimated edible grams only.
- Deterministic nutrient calculation on a per-100-g edible basis.
- Linked household portion quantity and gram-weight conversion helpers.
- USDA FoodData Central search/detail adapter.
- Food-source licensing and provenance policy for SG FoodID, MyFCD and USDA.
- D1 tables for food items, source cache, item nutrient results and meal totals.

### Task 4: dietitian dashboard interaction prototype

- Standalone HTML prototype in `dashboard/index.html`.
- Two-way editable portion quantity and edible gram weight.
- Editable serving reference weight, with selected portion preserved.
- Expandable source-record inspection panel and per-100-g nutrient table.
- Live illustrative totals, food component add/remove and review controls.
- Portion and review audit-history migration in `database/migrations/0004_portion_audit.sql`.

The dashboard is a synthetic-data UI prototype only. It is not authenticated, connected to D1 or Drive, or safe for real client information. Approve/reject controls do not persist a decision. The dashboard has not been browser-tested or clinically validated.

## Google Drive account setup

Create a dedicated Google account for Becomings and enable Google Drive API in a Google Cloud project. Configure an OAuth consent screen and OAuth client. Obtain an offline refresh token using the narrow `drive.file` scope. The application creates its own root folder and client folders, so it does not need broad access to the user's existing Drive files.

Keep the Google OAuth client secret and refresh token in Cloudflare Worker secrets. Never commit them to GitHub. The dedicated Google account and OAuth grant must be completed by the account owner.

## WhatsApp setup

Do not register, migrate, disconnect or otherwise change the live number until Meta Business Manager, WhatsApp Business App status, number eligibility and Coexistence onboarding have been checked. The Worker expects a supported Graph API version and a valid system-user access token with the required WhatsApp permissions.

## Required D1 setup

Apply:
- `database/schema.sql`
- `database/migrations/0002_add_client_drive_folder.sql`\n- `database/migrations/0003_add_nutrition_engine.sql`\n- `database/migrations/0004_portion_audit.sql`

The existing client onboarding process must create a client row and a current `granted` consent record before a sender's photos can be processed. Raw phone numbers are not stored in this database; the sender hash must be generated using the same HMAC secret as the webhook.

## Required secrets

- `META_VERIFY_TOKEN`
- `META_APP_SECRET`
- `WA_ID_HASH_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `META_GRAPH_API_VERSION`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

Use Cloudflare Worker secrets, not source files or GitHub commits.

## Safety and privacy

- Do not process photos without a current explicit consent record.
- Unknown or inactive senders are not downloaded or retained.
- Keep client folders private; never create public sharing permissions.
- Do not log raw webhook bodies, phone numbers, names, captions, images, access tokens or provider response bodies.
- Use synthetic test records and sample food images until consent, access control, retention and deletion procedures have been reviewed.
- Assess PDPA obligations, data-processing terms and cross-border transfers before production.

## Next tasks

1. Add automated tests and run a Worker build/type check.
2. Complete secure client onboarding and consent management.
3. Configure Google OAuth for the dedicated account.
4. Verify Meta Coexistence eligibility and complete supervised test onboarding.
5. Add OpenAI meal analysis with a strict output schema and uncertainty fields.
6. Build the private dietitian dashboard with manual approval.
