export interface User {
  id: string;
  email: string;
  google_id: string;
  notion_access_token?: string;
  notion_database_id?: string;
  notion_save_target_type?: "database" | "page";
  notion_save_target_title?: string;
  slack_access_token?: string;
  slack_channel_id?: string;
  monthly_minutes_used: number;
  last_reset_at: string;
  created_at: string;
}

export interface Recording {
  id: string;
  user_id: string;
  title: string;
  audio_file_path: string;
  audio_url?: string;
  duration_seconds: number;
  format: RecordingFormat;
  status: RecordingStatus;
  processing_step?: ProcessingStep;
  transcript?: string;
  formatted_content?: string;
  notion_page_url?: string;
  google_doc_url?: string;
  error_message?: string;
  error_step?: ErrorStep;
  is_hidden?: boolean;
  created_at: string;
  is_pinned?: boolean;
}

export type RecordingFormat = "meeting" | "interview" | "lecture" | "custom";
export type RecordingStatus = "recording" | "processing" | "completed" | "failed";
export type ProcessingStep = "transcription" | "formatting" | "saving";
export type ErrorStep = "upload" | "transcription" | "formatting" | "notion" | "slack";

export interface CustomFormat {
  id: string;
  user_id: string;
  name: string;
  prompt: string;
  created_at: string;
}

export interface FormatTemplate {
  id: RecordingFormat;
  name: string;
  icon: string;
  description: string;
  prompt: string;
}
