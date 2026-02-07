// =============================================================================
// Database Types - Supabase 테이블 스키마 기반 타입 정의
// =============================================================================

// -----------------------------------------------------------------------------
// Users Table
// -----------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  google_id: string;
  name?: string | null;
  language: "ko" | "en";
  is_onboarded: boolean;

  // Notion Integration
  notion_access_token?: string | null;
  notion_database_id?: string | null;
  notion_save_target_type?: "database" | "page" | null;
  notion_save_target_title?: string | null;

  // Slack Integration
  slack_access_token?: string | null;
  slack_channel_id?: string | null;

  // Google Integration
  google_access_token?: string | null;
  google_refresh_token?: string | null;
  google_token_expires_at?: string | null;
  google_folder_id?: string | null;
  google_folder_name?: string | null;

  // Push Notifications
  push_subscription?: PushSubscriptionData | null;
  push_enabled: boolean;

  // Audio Storage
  save_audio_enabled: boolean;

  // Usage & Limits
  monthly_minutes_used: number;
  last_reset_at: string;

  // Referral System
  referral_code?: string | null;
  referred_by?: string | null;
  bonus_minutes: number;

  // Promo System
  promo_code_id?: string | null;
  promo_applied_at?: string | null;
  promo_expires_at?: string | null;

  created_at: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// -----------------------------------------------------------------------------
// Recordings Table
// -----------------------------------------------------------------------------

export type RecordingStatus = "processing" | "completed" | "failed";
export type RecordingFormat = "meeting" | "interview" | "lecture" | "custom";
export type ErrorStep = "upload" | "transcription" | "formatting" | "notion" | "slack" | "google";
export type ProcessingStep = "transcription" | "formatting" | "notion" | "slack" | "google" | "completed";

export interface Recording {
  id: string;
  user_id: string;
  title: string;
  audio_file_path?: string | null; // nullable - audio not stored
  duration_seconds: number;
  format: RecordingFormat;
  custom_format_id?: string | null;
  status: RecordingStatus;
  processing_step?: ProcessingStep | null;
  transcript?: string | null;
  formatted_content?: string | null;
  notion_page_url?: string | null;
  google_doc_url?: string | null;
  error_message?: string | null;
  error_step?: ErrorStep | null;
  is_hidden?: boolean;
  is_pinned?: boolean;
  created_at: string;
}

// Recording list item - excludes large text fields for performance
export interface RecordingListItem {
  id: string;
  title: string;
  status: RecordingStatus;
  processing_step?: ProcessingStep | null;
  created_at: string;
  duration_seconds: number;
  is_pinned?: boolean;
  error_step?: ErrorStep | null;
  error_message?: string | null;
  notion_page_url?: string | null;
  google_doc_url?: string | null;
  format: RecordingFormat;
  // Optional fields that may be needed for detail view navigation
  transcript?: string | null;
}

export interface RecordingInsert {
  user_id: string;
  title: string;
  audio_file_path?: string | null;
  duration_seconds: number;
  format: RecordingFormat;
  custom_format_id?: string | null;
  status?: RecordingStatus;
}

export interface RecordingUpdate {
  title?: string;
  status?: RecordingStatus;
  processing_step?: ProcessingStep | null;
  transcript?: string | null;
  formatted_content?: string | null;
  notion_page_url?: string | null;
  google_doc_url?: string | null;
  error_message?: string | null;
  error_step?: ErrorStep | null;
  is_hidden?: boolean;
}

// -----------------------------------------------------------------------------
// Custom Formats Table
// -----------------------------------------------------------------------------

export interface CustomFormat {
  id: string;
  user_id: string;
  name: string;
  prompt: string;
  is_default: boolean;
  created_at: string;
}

export interface CustomFormatInsert {
  user_id: string;
  name: string;
  prompt: string;
  is_default?: boolean;
}

export interface CustomFormatUpdate {
  name?: string;
  prompt?: string;
  is_default?: boolean;
}

// -----------------------------------------------------------------------------
// Withdrawn Users Table
// -----------------------------------------------------------------------------

export interface WithdrawnUser {
  id: string;
  original_user_id: string;
  email: string;
  name?: string | null;
  data?: Record<string, unknown> | null;
  withdrawal_reason?: string | null;
  withdrawn_at: string;
}

// -----------------------------------------------------------------------------
// API Response Types
// -----------------------------------------------------------------------------

export interface UserConnectionStatus {
  notionConnected: boolean;
  slackConnected: boolean;
  googleConnected: boolean;
}

export interface NotionSaveTarget {
  type: "database" | "page";
  id: string;
  title: string;
}

export interface GoogleFolder {
  id: string;
  name: string;
}

// -----------------------------------------------------------------------------
// Promo Codes Table
// -----------------------------------------------------------------------------

export type PromoBenefitType = "pro_trial";

export interface PromoCode {
  id: string;
  code: string;
  name: string;
  max_redemptions: number;
  current_redemptions: number;
  benefit_type: PromoBenefitType;
  benefit_duration_days: number;
  is_active: boolean;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const MONTHLY_MINUTES_LIMIT = 350;
export const REFERRAL_BONUS_MINUTES = 30;
export const MAX_CUSTOM_FORMATS = 1;
export const PRO_MAX_CUSTOM_FORMATS = 999; // Effectively unlimited for Pro users
