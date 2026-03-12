# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Archy is an automated voice documentation service built with Next.js 16 (App Router). Users record audio in a session/chunk pipeline, each chunk is transcribed via Groq Whisper Large V3, the merged transcript is formatted by Gemini `gemini-3.1-pro-preview` while `GEMINI_API_KEY` is present before `2026-05-06 00:00:00 KST`, otherwise by OpenAI `gpt-4o-mini`, and the result can be saved to Notion/Google Docs with optional Slack and Web Push notifications. The app is a multilingual (Korean/English) PWA.

**Important audio nuance:** The primary session/chunk recorder is text-first and normally leaves `audio_file_path` as `null`. A legacy direct-upload route (`POST /api/recordings`) can store audio in Supabase Storage when `save_audio_enabled` is true, and signed playback endpoints remain for recordings that actually have stored audio.

**Source of truth note:** For the current API surface, setup, and lifecycle behavior, prefer [docs/LLMS.md](docs/LLMS.md), [docs/FEATURE_SPEC.md](docs/FEATURE_SPEC.md), [SETUP.md](SETUP.md), `app/api/**/route.ts`, and `lib/types/database.ts`. Older examples in this file may lag behind implementation details.

## Terminology

- `Archy`: the user-facing product and service.
- `Archy Ops Agent`: the canonical name for the Railway-deployed internal operations agent that administers Archy.
- Preferred Korean name: `아키 운영 에이전트`.
- Accepted alias: `아키 에이전트`.
- Do not treat `Archy` and `Archy Ops Agent` as the same actor.

## Development Commands

```bash
# Development server (http://localhost:3000)
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Lint check (ESLint)
npm run lint

# Fix auto-fixable ESLint issues
npm run lint -- --fix

# Type check (no script in package.json - use directly)
npx tsc --noEmit
```

## Code Quality Tools

### ESLint Configuration
- Located at `eslint.config.mjs`
- Extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- Rules configured:
  - Unused variables: warn (with `_` prefix ignore pattern)
  - Explicit `any`: warn
  - `@typescript-eslint/no-require-imports`: off
  - Console statements: warn (except `console.warn` and `console.error`)
  - Prefer `const` over `let`: warn
  - `react-hooks/immutability`: off
  - `react-hooks/set-state-in-effect`: off
  - `react/no-unescaped-entities`: off
- Ignore globs: `.next/**`, `node_modules/**`, `out/**`, `build/**`, `coverage/**`, `*.tsbuildinfo`, `next-env.d.ts`

## Architecture

### Tech Stack
- **Frontend**: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js Route Handlers (Node + Edge where explicitly set)
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Auth**: Supabase Auth (Google sign-in) plus separate Notion / Google Docs / Slack OAuth integrations
- **External APIs**: Groq Whisper (STT), Gemini + OpenAI (formatting), Notion API, Google Docs/Drive API, Slack API, Polar
- **Push Notifications**: Web Push with VAPID keys

### Directory Structure

```
app/
├── api/                    # Route handlers
│   ├── recordings/         # Session lifecycle, chunk upload, finalize, CRUD
│   ├── user/               # Profile, usage, onboarding, language, referral, data, push
│   ├── auth/               # Supabase callback + Notion/Google/Slack OAuth
│   ├── notion/             # Save target search + page/database helpers
│   ├── google/             # Google Drive folder operations
│   ├── promo/              # Promo apply/status
│   ├── checkout/           # Polar checkout
│   └── webhook/polar/      # Polar subscription webhook
├── dashboard/              # Recorder entry
│   ├── history/            # Recording list UI route
│   ├── recordings/[id]/    # Recording detail route
│   └── settings/           # Account / integrations / formats / contact / plan UI
├── onboarding/             # 2-step consent + referral flow
├── auth/auth-code-error/   # Supabase auth callback error page
├── privacy/
├── terms/
└── use-of-user-data/

lib/
├── api/                    # withAuth, response helpers, retry utilities
├── supabase/               # Client/server/middleware for Supabase
├── services/               # External API integrations
│   ├── whisper.ts          # Groq Whisper Large V3 STT
│   ├── openai.ts           # Gemini/OpenAI formatting provider selection
│   ├── recording-finalizer.ts
│   ├── notion.ts           # Notion OAuth + page creation
│   ├── notion-save-targets.ts
│   ├── google.ts           # Google Docs/Drive integration
│   ├── slack.ts            # Slack OAuth + notifications
│   ├── push.ts             # Web push notifications
│   ├── groq-key-router.ts
│   ├── groq-audio-budget.ts
│   ├── recording-transcription-state.ts
│   └── recording-processor.ts  # Formatting + external sync orchestration
├── i18n/                   # Korean/English translations
├── monitoring/             # Sentry helpers/config
├── stores/                 # Zustand user/recordings caches
├── prompts.ts              # Universal AI formatting prompt
├── utils.ts                # Utility functions
└── auth.ts                 # Auth helper functions

components/
├── dashboard/              # Recording interface components
├── history/                # Recording list components
│   └── sections/           # RecordingCard, FilterChips, EmptyState
├── landing/                # Marketing / landing UI
├── navigation/             # BottomTab navigation
├── pwa/                    # PWA install prompts
├── recorder/               # Audio recording UI
├── recordings/             # Recording detail components
└── settings/               # Settings page components
    └── sections/           # Account, Integrations, CustomFormats

database/
├── schema.sql              # Legacy baseline only
└── migrations/             # Incremental migrations (run in order)
```

### Database Schema

`database/schema.sql` is not the full current schema. Treat `lib/types/database.ts` plus `database/migrations/*` as the authoritative reference.

Core tables / structures:

**users**
- Auth/profile: `email`, `google_id`, `name`, `language`, `is_onboarded`
- Integrations: Notion (`notion_database_id`, `notion_save_target_type`, title/icon metadata), Slack, Google Docs/Drive
- Notifications/storage: `push_subscription`, `push_enabled`, `pwa_installed_at`, `save_audio_enabled`
- Consent: `age_14_confirmed_at`, `terms_*`, `privacy_*`, `service_quality_opt_in`, `marketing_opt_in`
- Usage/growth: `monthly_minutes_used`, `last_reset_at`, `referral_code`, `referred_by`, `bonus_minutes`, `promo_*`
- Payment: `is_paid_user`, `paid_ever`, `paid_started_at`, `paid_ended_at`, `polar_customer_id`, `polar_subscription_id`

**recordings**
- Metadata: `title`, `format`, `custom_format_id`, `duration_seconds`
- Lifecycle: `status`, `processing_step`, `error_step`, `error_message`, `last_activity_at`, `session_paused_at`, `termination_reason`, `last_chunk_index`
- Content/results: `transcript`, `formatted_content`, `notion_page_url`, `google_doc_url`
- Quality: `expected_chunk_count`, `transcription_quality_status`, `transcription_warnings`
- Audio: `audio_file_path` is nullable and usually null in the primary chunked flow
- UX: `is_hidden`, `is_pinned`

**recording_chunks**
- Chunk-level attempt tracking for the session-based recorder
- Stores per-chunk status, retry count, provider status/error codes, duration, signal metadata

**custom_formats**
- User-defined templates: `name`, `prompt`, `is_default`
- Free tier limit is 1; Pro effectively uses 999

**Other important tables**
- `promo_codes`
- `user_consent_logs`
- `withdrawn_users`
- `amplitude_signup_identity_mappings`
- `groq_audio_usage_buckets`, `groq_key_health`
- `agent_memory_threads`, `agent_memory_messages`, `agent_memory_facts`

### Key Constants

```typescript
export const MONTHLY_MINUTES_LIMIT = 350;      // Base free tier (minutes)
export const MAX_CUSTOM_FORMATS = 1;           // Free tier custom format limit
export const REFERRAL_BONUS_MINUTES = 350;     // Bonus per successful referral
// Total available = MONTHLY_MINUTES_LIMIT + bonus_minutes
```

### Recording Processing Flow

1. `POST /api/recordings/start`: create or resume a `status='recording'` session
2. `POST /api/recordings/chunk`: upload 20s chunks, apply signal gates, transcribe via Groq, and update `recording_chunks` plus session progress
3. `POST /api/recordings/pause-notify`: persist auto-pause state and optionally push a notification
4. `POST /api/recordings/finalize-intent`: schedule background finalize with `after()`
5. `POST /api/recordings/finalize`: synchronous fallback / recovery path when needed
6. Formatting + external sync:
   - Gemini (`gemini-3.1-pro-preview`) when `GEMINI_API_KEY` is present before `2026-05-06 00:00:00 KST`, otherwise OpenAI (`gpt-4o-mini`) → `formatted_content` + title
   - Notion / Google Docs / Slack / Push if configured
7. Final status becomes `completed` or `failed`

**Important**: The session/chunk pipeline passes chunk blobs directly to `transcribeAudio()` and does not persist chunk audio. Stored audio playback only applies to recordings that already have `audio_file_path` set (currently the legacy direct-upload route).

### Supabase Client Patterns

- **Server Components/API Routes**: Use `createClient()` from `@/lib/supabase/server`
- **Client Components**: Use `createClient()` from `@/lib/supabase/client`
- **Middleware**: Uses `updateSession()` from `@/lib/supabase/middleware`

Always check auth before operations:
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

### Internationalization (i18n)

- Translations in `lib/i18n/translations.ts` (Korean/English)
- Language detection: Browser locale or user's saved preference
- Language persists through OAuth flows via URL params
- User can change language in settings

### PWA Configuration

- `public/manifest.json`: App metadata, icons, theme, shortcuts
- `public/sw.js`: Service worker for offline capability & push notifications
- `app/register-sw.tsx`: Service worker registration
- Icons in `public/icons/` and `public/logos/`

## Current API / Setup References

- Current API surface: `docs/FEATURE_SPEC.md`
- Current codebase summary for models/flows: `docs/LLMS.md`
- Current setup and migration order: `SETUP.md`
- Current deployment topology: `DEPLOYMENT.md`
- Current route implementations: `app/api/**/route.ts`

## Key Features

### Recording Pinning
- Records can be pinned to appear at top of history list
- `is_pinned` boolean field in recordings table
- Swipe right gesture on recording card to pin/unpin

### Swipe Gestures on Recording Cards
- **Left swipe (80px)**: Delete action with visual feedback
- **Right swipe (80px)**: Pin/unpin action
- Min swipe distance: 50px, max swipe range: ±80px
- Touch devices only

### Google Docs Integration
- Users can save recordings as Google Docs
- OAuth flow with token refresh handling
- Folder selection in Google Drive
- `google_doc_url` stored in recording

### Referral System
- Unique 8-character referral codes (e.g., "AB12CD34")
- Auto-generated on first signup using PostgreSQL trigger
- 350 bonus minutes per successful referral (both parties)
- Cannot use own referral code
- Share via Kakao Talk or clipboard

### Web Push Notifications
- Notifications when recording processing completes
- VAPID-based subscription management
- Handles expired subscriptions gracefully

### Audio Playback / Storage
- `save_audio_enabled` exists in user settings and `/api/recordings/[id]/audio` serves signed URLs for stored audio
- The primary session/chunk recorder still keeps `audio_file_path` null
- The legacy direct-upload route can persist audio when enabled
- Old recordings without audio show a "no audio" message
- Individual recording deletion removes the stored file when `audio_file_path` exists

### Account Withdrawal (GDPR Compliant)
- Users can withdraw with optional reason
- Full data snapshot archived to `withdrawn_users`
- All user data deleted (recordings, formats, auth)
- Referral links unlinked to prevent FK issues

### Universal AI Formatting Prompt
- Single adaptive prompt in `lib/prompts.ts`
- Auto-generates title + 3-line bullet summary
- Flexible body structure with markdown headers
- Adapts to content type (meeting, interview, lecture, etc.)

## Database / Env References

- `database/schema.sql` is a legacy baseline, not the complete current schema
- Use `SETUP.md` for the authoritative migration order
- Use `.env.example` for the current environment variable matrix

## Common Gotchas

1. **Audio storage is not part of the main chunked flow**: `save_audio_enabled` and signed playback routes exist, but session-based `/api/recordings/start|chunk|finalize*` recordings normally keep `audio_file_path` null; only the legacy `POST /api/recordings` path stores audio today
2. **Background processing is not queued**: In production, replace the async `processRecording()` call with a proper queue (e.g., BullMQ, Inngest)
3. **RLS is enabled**: Always filter by `user_id` in queries; Supabase policies enforce this
4. **OAuth redirects**: Must match exactly in provider settings (no trailing slash differences)
5. **Korean language**: Groq Whisper uses `language: "ko"` parameter for better Korean accuracy
6. **Service worker**: Changes to `sw.js` may require hard refresh or cache clear in browser
7. **Bonus minutes are additive**: Total available = 350 + bonus_minutes from referrals
8. **Google tokens expire**: Service auto-refreshes tokens using refresh_token
9. **Referral codes auto-generate**: Via PostgreSQL trigger on user creation
10. **Recording pinning**: Sorted by is_pinned DESC, then created_at DESC
11. **ESLint warnings**: Run `npm run lint -- --fix` to auto-fix most issues before committing code

## Task Execution Guidelines

When the user requests a new task in a new session, follow this process:

1. **Evaluate the Approach**: Think critically about the user's proposed approach. If you have a better alternative or improvement, suggest it to the user before proceeding.

2. **Clarify Requirements**: If you need additional information or clarification to complete the task properly, ask the user BEFORE starting the implementation.

3. **Proceed Immediately**: If the user's approach is solid and you have all necessary information, begin the implementation right away without asking for permission.

**Key Principle**: Balance between being proactive (don't ask unnecessary questions) and being thoughtful (do raise concerns or suggest improvements when genuinely valuable).

## Testing Guidelines

**CRITICAL**: When completing code updates, ALWAYS inform the user which parts they should manually test to verify the changes work correctly. This is MANDATORY for every code change.

For each update, provide:
1. **What to test**: Specific features, flows, or UI elements affected
2. **How to test**: Step-by-step testing instructions
3. **Expected behavior**: What should happen if working correctly
4. **Edge cases**: Specific scenarios to verify

### Testing Checklist by Update Type

**Database migrations:**
- [ ] Query affected table(s) to verify schema changes: `SELECT * FROM table_name LIMIT 1;`
- [ ] Create/update records with new fields via Supabase dashboard or API
- [ ] Verify existing data is unaffected
- [ ] Test RLS policies: try accessing data as different users
- [ ] Check triggers/functions execute correctly

**API endpoints:**
- [ ] Call endpoint with valid data (via UI, Postman, or curl)
- [ ] Call with invalid/missing data to verify error handling
- [ ] Check response format and status codes
- [ ] Verify data persistence in database
- [ ] Test auth protection: call without authentication
- [ ] Check server logs for errors

**UI components:**
- [ ] Interact with component in browser (click, type, navigate)
- [ ] Test responsive behavior (mobile, tablet, desktop)
- [ ] Switch between Korean and English languages
- [ ] Check browser console for errors
- [ ] Verify loading/error states
- [ ] Test accessibility (keyboard navigation, screen reader)

**Recording flow:**
- [ ] Record short audio (10-20 seconds), verify transcription
- [ ] Check formatted output in database and Notion/Google Docs
- [ ] Verify `monthly_minutes_used` increments correctly
- [ ] Test with different format types (meeting, interview, lecture, custom)
- [ ] Test error handling: try without Notion/API credentials
- [ ] Check recording status updates in History page
- [ ] Test recording pinning via swipe gesture

**Swipe Gestures:**
- [ ] Right swipe (>50px) pins/unpins recording
- [ ] Left swipe (>50px) opens delete confirmation
- [ ] Visual feedback during swipe
- [ ] Works on touch devices only

**Integration features (Notion/Slack/Google):**
- [ ] Complete OAuth flow from Settings page
- [ ] Verify tokens saved to database
- [ ] Trigger integration (e.g., create recording → check Slack notification)
- [ ] Verify result in external service (Notion page, Slack message, Google Doc)
- [ ] Test disconnect and reconnect flow
- [ ] Test with missing/revoked credentials
- [ ] Verify Google token refresh works

**Referral System:**
- [ ] New users get unique 8-char referral code
- [ ] Can apply referral code (max once per account)
- [ ] Both users receive 350 bonus minutes
- [ ] Cannot use own code
- [ ] Bonus minutes increase monthly limit
- [ ] Share via Kakao Talk works

**Push Notifications:**
- [ ] Subscribe/unsubscribe flow works
- [ ] Notifications sent on processing complete
- [ ] Expired subscriptions handled gracefully

**Account Withdrawal:**
- [ ] User data archived to withdrawn_users
- [ ] Account deletion complete
- [ ] Can re-signup as new user
- [ ] Referral links unlinked properly

**Authentication:**
- [ ] Sign up with new account
- [ ] Sign in with existing account
- [ ] Sign out and verify redirect
- [ ] Test protected routes without auth
- [ ] Verify session persistence across page refreshes

**Internationalization:**
- [ ] Switch language in Settings
- [ ] Verify all text updates immediately
- [ ] Test OAuth flows preserve language
- [ ] Check both Korean and English prompts generate correct output

### Example Testing Instructions

When you complete an update, format testing instructions like this:

```
## Testing Required

Please test the following to verify the changes:

1. **Database Migration - Referral System**
   - Open Supabase SQL Editor
   - Run: `SELECT referral_code, referred_by, bonus_minutes FROM users LIMIT 5;`
   - Expected: All users should have unique 8-character referral codes

2. **Referral Code Generation**
   - Sign up with a new account
   - Check database: new user should have auto-generated referral code
   - Expected: Format like "AB12CD34" (8 characters, no ambiguous chars)

3. **Referral Link Usage**
   - Copy your referral code from Settings
   - Sign out and visit: `http://localhost:3000/onboarding?ref=YOUR_CODE`
   - Complete signup
   - Expected: New user's `referred_by` field points to your user ID
   - Expected: Both users get bonus minutes

Edge cases to test:
- Try signing up without referral code (should work normally)
- Try invalid referral code (should ignore and proceed)
- Verify referral codes are case-insensitive
```

This structured approach ensures the user can systematically verify your changes work correctly.
