# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Archy is an automated voice documentation service built with Next.js 14 (App Router). Users record audio, which is transcribed via Groq Whisper API, formatted by OpenAI GPT-4o-mini, and saved to Notion/Google Docs with optional Slack notifications. The app is a PWA with multilingual support (Korean/English).

**Critical: Audio files are NOT stored.** They are sent directly to Groq API for transcription, then discarded. Only text (transcripts and formatted content) is persisted in the database.

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
- **Frontend**: Next.js 14 App Router, React 19, TypeScript, Tailwind CSS
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
├── onboarding/             # 3-step setup flow
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
- Max 3 per user

**withdrawn_users**
- Anonymized withdrawal statistics (no PII)
- Stores withdrawal reason, account age, integration usage, referral stats
- JSONB user_data snapshot for audit

### Key Constants

```typescript
export const MONTHLY_MINUTES_LIMIT = 350;      // Base free tier (minutes)
export const MAX_CUSTOM_FORMATS = 3;           // Max custom formats per user
export const REFERRAL_BONUS_MINUTES = 350;     // Bonus per successful referral
// Total available = MONTHLY_MINUTES_LIMIT + bonus_minutes
```

### Recording Processing Flow

1. **POST /api/recordings**: Client uploads audio + metadata
2. Create recording record with `status: 'processing'`
3. Background async processing (no queue - production should use one):
   - **Transcription**: Send audio File to Groq Whisper API → get text
   - **Formatting**: Send transcript to OpenAI with universal prompt → get formatted doc with title
   - **Notion**: Create page in user's database/page (if configured)
   - **Google Docs**: Create doc in user's Drive folder (if configured)
   - **Slack**: Send notification (if configured)
   - **Push**: Send web push notification (if enabled)
4. Update recording status to 'completed' or 'failed'
5. Update user's monthly usage (`monthly_minutes_used`)

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

## API Routes - Complete List

### Recording Management
- `POST /api/recordings` - Create & process recording (checks monthly limit + bonus)
- `GET /api/recordings` - List all recordings (sorted by is_pinned DESC, created_at DESC)
- `GET /api/recordings/[id]` - Get recording details
- `PATCH /api/recordings/[id]` - Update title, is_hidden, or is_pinned
- `DELETE /api/recordings/[id]` - Delete recording

### Format Management
- `GET /api/formats` - List custom formats
- `POST /api/formats` - Create custom format (max 3 per user)
- `PUT /api/formats` - Update or set as default
- `DELETE /api/formats` - Delete format

### User Management
- `GET /api/user/data` - Get connection status
- `DELETE /api/user/data` - Reset all integrations & data
- `GET /api/user/profile` - Get profile with integration status
- `GET /api/user/language` - Get user language
- `PUT /api/user/language` - Set language (ko/en)
- `GET /api/user/onboarding` - Check onboarding status
- `PUT /api/user/onboarding` - Mark as onboarded
- `GET /api/user/usage` - Get monthly usage stats
- `GET /api/user/referral` - Get referral code & bonus minutes
- `POST /api/user/referral` - Apply referral code
- `DELETE /api/user/withdraw` - Initiate account withdrawal

### Notion Integration
- `GET /api/auth/notion` - Initiate OAuth
- `GET /api/auth/notion/callback` - Handle callback
- `GET /api/notion/database` - Get target database
- `GET /api/notion/databases` - List accessible databases
- `POST /api/notion/page` - Create page in database
- `GET /api/notion/pages` - List pages

### Google Integration
- `GET /api/auth/google` - Initiate OAuth
- `GET /api/auth/google/callback` - Handle callback
- `GET /api/google/folders` - List Google Drive folders
- `PUT /api/user/google` - Update folder settings
- `DELETE /api/user/google` - Disconnect Google

### Slack Integration
- `GET /api/auth/slack` - Initiate OAuth
- `GET /api/auth/slack/callback` - Handle callback

### Push Notifications
- `GET /api/user/push-subscription` - Get VAPID public key
- `POST /api/user/push-subscription` - Save subscription
- `DELETE /api/user/push-subscription` - Unsubscribe

### Audio Storage
- `GET /api/user/audio-storage` - Get audio storage setting
- `PATCH /api/user/audio-storage` - Toggle audio storage setting
- `GET /api/recordings/[id]/audio` - Get signed URL for audio playback

### Auth
- `GET /api/auth/callback` - Supabase OAuth callback
- `GET /api/auth/signout` - Sign out

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

## Database Management

### Initial Setup
1. Run `database/schema.sql` in Supabase SQL Editor
2. Run migrations in order (see below)

### Migration Order
1. `add_language.sql` - User language preference (ko/en)
2. `add_is_onboarded.sql` - Onboarding completion flag
3. `make_audio_file_path_nullable.sql` - Audio not stored, path nullable
4. `add_notion_save_target_fields.sql` - Notion database/page target selection
5. `add_processing_step.sql` - Track processing stage
6. `add_error_tracking.sql` - Error step & message for debugging
7. `add_push_notification.sql` - Push subscription & enabled flag
8. `add_referral_system.sql` - Referral code, referred_by, bonus_minutes
9. `add_google_integration.sql` - Google OAuth tokens & folder settings
10. `add_user_name.sql` - User display name field
11. `add_withdrawn_users_table.sql` - Withdrawal archive table
12. `update_withdrawn_users_add_data.sql` - Store full user snapshot (JSONB)
13. `update_withdrawn_users_add_name.sql` - Store user name separately
14. `add_audio_storage_setting.sql` - User audio storage preference (opt-in, default false)
15. `add_recording_session.sql` - Recording session status and chunk tracking
16. `add_custom_format_is_default.sql` - Default flag for custom formats

### Adding Migrations
- Create new file in `database/migrations/`
- Update this file with migration order
- Test locally before production deployment

## Environment Variables

Required:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# AI APIs
GROQ_API_KEY=...           # Whisper STT
OPENAI_API_KEY=...         # GPT-4o-mini

# Notion OAuth
NOTION_CLIENT_ID=...
NOTION_CLIENT_SECRET=...
NOTION_REDIRECT_URI=...

# Slack OAuth
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_REDIRECT_URI=...

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...

# Push Notifications (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=...

# App
NEXT_PUBLIC_APP_URL=...

# Kakao (for referral sharing)
NEXT_PUBLIC_KAKAO_JS_KEY=...
```

See `.env.example` for full structure.

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
