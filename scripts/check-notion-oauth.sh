#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://www.archynotes.com}"
BASE_URL="${BASE_URL%/}"
EXPECTED_CALLBACK_URI="${BASE_URL}/api/auth/notion/callback"

AUTH_URL="${BASE_URL}/api/auth/notion?returnTo=/dashboard/settings"
CALLBACK_URL="${BASE_URL}/api/auth/notion/callback"

pass() {
  printf '[PASS] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

get_status_and_location() {
  local url="$1"
  local headers

  headers="$(curl -sS -D - -o /dev/null "$url")"

  local status
  status="$(printf '%s\n' "$headers" | awk 'toupper($1) ~ /^HTTP\// { code=$2 } END { print code }')"

  local location
  location="$(printf '%s\n' "$headers" | awk 'tolower($1)=="location:" { sub(/\r$/, "", $2); print $2; exit }')"

  printf '%s\n%s\n' "$status" "$location"
}

printf 'Base URL: %s\n' "$BASE_URL"
printf 'Expected Notion redirect_uri: %s\n\n' "$EXPECTED_CALLBACK_URI"

printf '1) Checking /api/auth/notion redirect\n'
auth_result="$(get_status_and_location "$AUTH_URL")"
AUTH_STATUS="$(printf '%s\n' "$auth_result" | sed -n '1p')"
AUTH_LOCATION="$(printf '%s\n' "$auth_result" | sed -n '2p')"

[[ -n "$AUTH_STATUS" ]] || fail "No HTTP status from $AUTH_URL"
[[ -n "$AUTH_LOCATION" ]] || fail "No Location header from $AUTH_URL"

[[ "$AUTH_STATUS" == "307" || "$AUTH_STATUS" == "302" ]] \
  || fail "Unexpected status from auth endpoint: $AUTH_STATUS"

[[ "$AUTH_LOCATION" == https://api.notion.com/* ]] \
  || fail "Auth redirect does not point to Notion: $AUTH_LOCATION"

AUTH_REDIRECT_URI="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.searchParams.get("redirect_uri") || "");' "$AUTH_LOCATION")"
AUTH_STATE_RETURN_TO="$(node -e 'try { const u=new URL(process.argv[1]); const raw=u.searchParams.get("state"); const s=raw ? JSON.parse(raw) : {}; process.stdout.write(s.returnTo || ""); } catch { process.stdout.write(""); }' "$AUTH_LOCATION")"

[[ "$AUTH_REDIRECT_URI" == "$EXPECTED_CALLBACK_URI" ]] \
  || fail "redirect_uri mismatch. expected=$EXPECTED_CALLBACK_URI actual=$AUTH_REDIRECT_URI"
pass "Auth endpoint returns Notion OAuth URL with correct redirect_uri"

[[ "$AUTH_STATE_RETURN_TO" == "/dashboard/settings" ]] \
  || fail "state.returnTo mismatch. expected=/dashboard/settings actual=$AUTH_STATE_RETURN_TO"
pass "Auth state preserves returnTo=/dashboard/settings"

printf '\n2) Checking /api/auth/notion/callback (no code)\n'
callback_result="$(get_status_and_location "$CALLBACK_URL")"
CALLBACK_STATUS="$(printf '%s\n' "$callback_result" | sed -n '1p')"
CALLBACK_LOCATION="$(printf '%s\n' "$callback_result" | sed -n '2p')"

[[ -n "$CALLBACK_STATUS" ]] || fail "No HTTP status from $CALLBACK_URL"
[[ -n "$CALLBACK_LOCATION" ]] || fail "No Location header from $CALLBACK_URL"

[[ "$CALLBACK_STATUS" == "307" || "$CALLBACK_STATUS" == "302" ]] \
  || fail "Unexpected status from callback endpoint: $CALLBACK_STATUS"

CALLBACK_ERROR="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.searchParams.get("error") || "");' "$CALLBACK_LOCATION")"
CALLBACK_ORIGIN="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.origin);' "$CALLBACK_LOCATION")"
EXPECTED_ORIGIN="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.origin);' "$BASE_URL")"

[[ "$CALLBACK_ERROR" == "no_code" ]] \
  || fail "Callback no-code error mismatch. expected=no_code actual=$CALLBACK_ERROR"
pass "Callback without code returns error=no_code"

[[ "$CALLBACK_ORIGIN" == "$EXPECTED_ORIGIN" ]] \
  || fail "Callback redirect origin mismatch. expected=$EXPECTED_ORIGIN actual=$CALLBACK_ORIGIN"
pass "Callback redirect origin is canonical ($EXPECTED_ORIGIN)"

printf '\nAll checks passed.\n'
