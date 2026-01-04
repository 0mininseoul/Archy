# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flownote is an automated voice documentation service built with Next.js 14 (App Router). Users record audio, which is transcribed via Groq Whisper API, formatted by OpenAI GPT-4o-mini, and saved to Notion with optional Slack notifications. The app is a PWA with multilingual support (Korean/English).

**Critical: Audio files are NOT stored.** They are sent directly to Groq API for transcription, then discarded. Only text (transcripts and formatted content) is persisted in the database.

## Development Commands

```bash
# Development server (http://localhost:3000)
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Lint check
npm run lint

# Type check (no script in package.json - use directly)
npx tsc --noEmit
```

## Architecture

### Tech Stack
- **Frontend**: Next.js 14 App Router, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (serverless)
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Auth**: Supabase Auth with Google OAuth
- **External APIs**: Groq Whisper (STT), OpenAI GPT-4o-mini (formatting), Notion API, Slack API

### Directory Structure

```
app/
├── api/              # API Routes
│   ├── recordings/   # Recording CRUD + processing
│   ├── formats/      # Custom format templates
│   ├── user/         # User data, usage, language, onboarding
│   ├── auth/         # OAuth callbacks (Google, Notion, Slack)
│   └── notion/       # Notion database/page operations
├── dashboard/        # Main recording interface
├── history/          # Recording list with status
├── settings/         # Account, integrations, formats
└── onboarding/       # 3-step setup flow

lib/
├── supabase/         # Client/server/middleware for Supabase
├── services/         # External API integrations
│   ├── whisper.ts    # Groq Whisper Large V3 STT
│   ├── openai.ts     # GPT-4o-mini formatting
│   ├── notion.ts     # Notion OAuth + page creation
│   └── slack.ts      # Slack OAuth + notifications
├── i18n/             # Korean/English translations
├── prompts.ts        # Document formatting prompts
└── auth.ts           # Auth helper functions

components/
├── recorder/         # Audio recording UI
├── history/          # Recording list components
├── settings/         # Settings page components
└── ...               # Other UI components

database/
├── schema.sql        # Base schema (users, recordings, custom_formats)
└── migrations/       # Incremental migrations (run in order)
```

### Database Schema

Three main tables (PostgreSQL with RLS):
- **users**: Auth, integrations (Notion/Slack tokens), usage tracking
- **recordings**: Metadata, status, transcript, formatted_content, error tracking
- **custom_formats**: User-defined document templates

**Key fields:**
- `recordings.audio_file_path`: Nullable (audio not stored)
- `recordings.status`: 'processing' | 'completed' | 'failed'
- `recordings.error_step`: Tracks which stage failed (upload, transcription, formatting, notion, slack)
- `users.notion_save_target_type`: 'database' | 'page' (where to save in Notion)
- `users.language`: 'ko' | 'en'
- `users.is_onboarded`: Boolean flag

### Recording Processing Flow

1. **POST /api/recordings**: Client uploads audio + metadata
2. Create recording record with `status: 'processing'`
3. Background async processing (no queue - production should use one):
   - **Transcription**: Send audio File to Groq Whisper API → get text
   - **Formatting**: Send transcript to OpenAI with format prompt → get formatted doc
   - **Notion**: Create page in user's database/page
   - **Slack**: Send notification (if configured)
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

- `public/manifest.json`: App metadata, icons, theme
- `public/sw.js`: Service worker for offline capability
- Icons in `public/icons/` and `public/logos/`

## Key Patterns

### Error Handling in Processing
The `processRecording()` function (in `/api/recordings/route.ts`) updates the recording with specific error steps:
```typescript
error_step: 'transcription' | 'formatting' | 'notion' | 'slack'
```
This allows users to see exactly where processing failed.

### Format Prompts
- Three default formats: 'meeting', 'interview', 'lecture'
- Prompts in `lib/prompts.ts` use `{{transcript}}` and `{{date}}` placeholders
- Users can create custom formats with their own prompts

### Monthly Usage Tracking
- Stored in `users.monthly_minutes_used`
- Checked before creating new recording (350-minute limit)
- Updated after successful transcription
- Reset monthly via `last_reset_at` timestamp

### OAuth Flows
- **Notion**: Requires `pages:read`, `pages:write` scopes; stores access token + database/page ID
- **Slack**: Requires `chat:write`, `channels:read`, `groups:read` scopes; stores access token + channel ID
- All OAuth callbacks preserve language settings via URL params

## Database Management

### Initial Setup
1. Run `database/schema.sql` in Supabase SQL Editor
2. Run migrations in order:
   - `add_language.sql`
   - `add_is_onboarded.sql`
   - `make_audio_file_path_nullable.sql`
   - `add_notion_save_target_fields.sql`
   - `add_processing_step.sql`
   - `add_error_tracking.sql`

### Adding Migrations
- Create new file in `database/migrations/`
- Update README.md and SETUP.md with migration order
- Test locally before production deployment

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY` (Whisper STT)
- `OPENAI_API_KEY` (GPT-4o-mini)
- `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`
- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI`
- `NEXT_PUBLIC_APP_URL`

Optional:
- `WHISPER_API_KEY` (alternative STT provider, not currently used)

See `.env.example` for full structure.

## Common Gotchas

1. **Audio files are not stored**: Don't try to read from `audio_file_path` - it's nullable and unused
2. **Background processing is not queued**: In production, replace the async `processRecording()` call with a proper queue (e.g., BullMQ, Inngest)
3. **RLS is enabled**: Always filter by `user_id` in queries; Supabase policies enforce this
4. **OAuth redirects**: Must match exactly in provider settings (no trailing slash differences)
5. **Korean language**: Groq Whisper uses `language: "ko"` parameter for better Korean accuracy
6. **Service worker**: Changes to `sw.js` may require hard refresh or cache clear in browser
