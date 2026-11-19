# Becomings Food Photo Monitoring System

This module is intentionally isolated from the existing static Becomings website. The website currently publishes from `outputs/`; this module is not part of that Pages build.

## Confirmed product decisions

- Existing Becomings WhatsApp Business number, subject to Meta Coexistence eligibility and onboarding.
- Personal Google Drive as the initial photo destination.
- Immediate per-meal AI analysis plus an end-of-day summary.
- Dietitian review is mandatory before any client-facing nutrition advice is released.

## Architecture

1. Meta WhatsApp Cloud API delivers signed webhooks to a Cloudflare Worker.
2. The webhook verifies Meta's signature, extracts image messages, hashes the sender ID, and queues a minimal event.
3. A queue consumer (next development task) downloads the image from Meta, saves the original to Google Drive, records the submission in D1, and invokes the OpenAI Responses API.
4. A private dashboard (later task) presents analyses for dietitian review.

Cloudflare Queues is used to move slow work out of the webhook request and to support retries. Queue consumers and idempotency must be implemented before production use.

## First development task included

- A webhook receiver with GET verification and POST signature validation.
- Image-message extraction and enqueueing.
- A D1 schema for client mapping, consent, submissions, analyses and daily summaries.

This is a foundation only. It is not production-ready until the queue consumer, Drive OAuth, Meta onboarding, D1 binding, tests, monitoring and access-controlled dashboard are completed.

## Secrets (never commit these)

- `META_VERIFY_TOKEN`
- `META_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN` (needed by the later media-download consumer)
- `WHATSAPP_PHONE_NUMBER_ID` (needed by the later media-download consumer)
- `WA_ID_HASH_SECRET`
- `OPENAI_API_KEY`
- Google OAuth client secret and refresh token (later task)

Use Cloudflare Worker secrets, not source files or GitHub commits.

## Important rollout gate: existing WhatsApp number

Do not register, migrate, disconnect or otherwise change the live number until Meta Coexistence eligibility and the complete onboarding path have been verified. Meta's current documentation describes coexistence through Embedded Signup and lists prerequisites, webhook subscriptions and feature limitations. Keep the existing app workflow unchanged until a supervised test succeeds.

## Personal Google Drive caution

The initial design uses a dedicated app-created folder in the selected personal Drive account. Use OAuth and the narrowest feasible Drive scope; do not grant broad access to all Drive files. Do not share client folders publicly. Because this is client health-related information, assess whether a business-controlled Workspace account is more appropriate before production use.

## Local development

Use the Worker directory's Wrangler configuration template as a starting point. Replace all placeholders locally; never commit real IDs, tokens or secrets. Run tests against synthetic client data and sample food images only.

## Release gates

1. Webhook verification and signature tests pass.
2. Duplicate webhook delivery does not create duplicate records.
3. Original photo is saved to the correct private client folder.
4. Failed downloads and API calls retry safely without losing the image.
5. AI output conforms to a validated schema and includes uncertainty flags.
6. No automatic diagnosis or client-facing treatment advice is sent.
7. Consent, access control, retention and deletion processes are tested.
