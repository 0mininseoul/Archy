# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Archy is an automated voice documentation service built with Next.js 16 (App Router). Users record audio, which is transcribed via Groq Whisper API, formatted by OpenAI GPT-4o-mini, and saved to Notion/Google Docs with optional Slack notifications. The app is a PWA with multilingual support (Korean/English).

**Critical: Audio files are NOT stored.** They are sent directly to Groq API for transcription, then discarded. Only text (transcripts and formatted content) is persisted in the database.

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
- Located at `.eslintrc.json`
- Extends `next/core-web-vitals` and `@typescript-eslint/recommended`
- Rules configured:
  - Unused variables: warn (with `_` prefix ignore pattern)
  - Explicit `any`: warn
  - Console statements: warn (except `console.warn` and `console.error`)
  - Prefer `const` over `let`: warn

## Architecture

### Tech Stack
- **Frontend**: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (serverless, Edge runtime where applicable)
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Auth**: Supabase Auth with Google OAuth
- **External APIs**: Groq Whisper (STT), OpenAI GPT-4o-mini (formatting), Notion API, Google Docs/Drive API, Slack API
- **Push Notifications**: Web Push with VAPID keys

### Directory Structure

```
app/
├── api/                    # API Routes
│   ├── recordings/         # Recording CRUD + processing
│   ├── formats/            # Custom format templates
│   ├── user/               # User data, usage, language, onboarding, referral, push
│   ├── auth/               # OAuth callbacks (Google, Notion, Slack)
│   ├── notion/             # Notion database/page operations
│   └── google/             # Google Drive folder operations
├── dashboard/              # Main recording interface
├── history/                # Recording list with status & filters
├── recordings/[id]/        # Recording detail page
├── settings/               # Account, integrations, formats
│   ├── formats/            # Custom format editor
│   └── contact/            # Contact & account withdrawal
│       └── withdraw/       # Withdrawal flow
├── onboarding/             # 2-step consent + referral flow
├── privacy/                # Privacy policy
└── terms/                  # Terms of service

lib/
├── api/                    # API utilities (withAuth, response helpers)
├── supabase/               # Client/server/middleware for Supabase
├── services/               # External API integrations
│   ├── whisper.ts          # Groq Whisper Large V3 STT
│   ├── openai.ts           # GPT-4o-mini formatting
│   ├── notion.ts           # Notion OAuth + page creation
│   ├── google.ts           # Google Docs/Drive integration
│   ├── slack.ts            # Slack OAuth + notifications
│   ├── push.ts             # Web push notifications
│   └── recording-processor.ts  # Orchestrates all processing steps
├── i18n/                   # Korean/English translations
├── types/                  # TypeScript types & constants
├── prompts.ts              # Universal AI formatting prompt
├── utils.ts                # Utility functions
└── auth.ts                 # Auth helper functions

components/
├── dashboard/              # Recording interface components
├── history/                # Recording list components
│   └── sections/           # RecordingCard, FilterChips, EmptyState
├── navigation/             # BottomTab navigation
├── pwa/                    # PWA install prompts
├── recorder/               # Audio recording UI
├── recordings/             # Recording detail components
└── settings/               # Settings page components
    └── sections/           # Account, Integrations, CustomFormats

database/
├── schema.sql              # Base schema (users, recordings, custom_formats, withdrawn_users)
└── migrations/             # Incremental migrations (run in order)
```

### Database Schema

Four main tables (PostgreSQL with RLS):

**users**
- Auth & profile (email, name, language, is_onboarded)
- Notion integration (access_token, database_id, page_id, save_target_type)
- Slack integration (access_token, channel_id)
- Google integration (access_token, refresh_token, token_expires_at, folder_id, folder_name)
- Push notifications (push_subscription JSONB, push_enabled)
- Referral system (referral_code, referred_by, bonus_minutes)
- Usage tracking (monthly_minutes_used, last_reset_at)

**recordings**
- Metadata (title, format_type, duration_seconds)
- Content (transcript, formatted_content)
- Status tracking (status, processing_step, error_step, error_message)
- Integrations (notion_page_id, notion_page_url, google_doc_url)
- Features (is_hidden, is_pinned)

**custom_formats**
- User-defined document templates (name, prompt, is_default)
- Free tier limit is 1; Pro effectively uses 999

**withdrawn_users**
- Anonymized withdrawal statistics (no PII)
- Stores withdrawal reason, account age, integration usage, referral stats
- JSONB user_data snapshot for audit

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
   - OpenAI → `formatted_content` + title
   - Notion / Google Docs / Slack / Push if configured
7. Final status becomes `completed` or `failed`

**Important**: Audio file is passed directly to `transcribeAudio()` and never written to disk/storage. After transcription, it's garbage collected.

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

### Audio Storage (Optional)
- Users can opt-in to save audio files in Supabase Storage
- Default is OFF (opt-in via Settings > Data Management)
- Audio recorded at 32kbps for storage efficiency
- Signed URLs for secure playback (1 hour expiry)
- Old recordings without audio show "no audio" message
- Audio deleted when recording is deleted

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

1. **Audio files are optional**: `audio_file_path` is nullable - only populated when user has `save_audio_enabled: true`
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
