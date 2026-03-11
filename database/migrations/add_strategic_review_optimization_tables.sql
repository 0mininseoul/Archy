-- Strategic review logging, feedback, evaluation, and prompt optimization tables.
-- Run in Supabase SQL Editor before enabling the strategic review self-improvement loop.

create table if not exists public.agent_llm_logs (
  id bigserial primary key,
  provider text not null default 'gemini',
  component text not null default 'ops-agent',
  flow text not null default 'general',
  tag text,
  run_id text,
  model text,
  status text not null default 'success' check (status in ('success', 'error')),
  system_instruction text,
  request_json jsonb not null default '{}'::jsonb,
  response_json jsonb,
  finish_reason text,
  usage_metadata jsonb,
  error_message text,
  latency_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_agent_llm_logs_created_at
  on public.agent_llm_logs (created_at desc);

create index if not exists idx_agent_llm_logs_flow_created_at
  on public.agent_llm_logs (flow, created_at desc);

create index if not exists idx_agent_llm_logs_run_id
  on public.agent_llm_logs (run_id);

create table if not exists public.strategic_review_prompt_versions (
  id bigserial primary key,
  version_label text not null unique,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  change_summary text not null default '',
  problem_summary text,
  system_instruction_suffix text not null default '',
  prompt_instruction_suffix text not null default '',
  approved_by_user_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_strategic_review_prompt_versions_status_created_at
  on public.strategic_review_prompt_versions (status, created_at desc);

insert into public.strategic_review_prompt_versions (
  version_label,
  status,
  change_summary,
  problem_summary,
  system_instruction_suffix,
  prompt_instruction_suffix
)
select
  'v1_base',
  'active',
  'Base strategic review prompt shipped from repository defaults.',
  'Initial baseline prompt version.',
  '',
  ''
where not exists (
  select 1
  from public.strategic_review_prompt_versions
  where version_label = 'v1_base'
);

create table if not exists public.strategic_review_runs (
  id bigserial primary key,
  run_id text not null unique,
  run_ymd date not null,
  target_ymd date not null,
  status text not null default 'started' check (status in ('started', 'completed', 'failed', 'skipped')),
  prompt_version_id bigint references public.strategic_review_prompt_versions(id) on delete set null,
  prompt_version_label text,
  model text,
  context_profile text,
  system_instruction text,
  user_prompt text,
  input_payload jsonb not null default '{}'::jsonb,
  raw_output text,
  rendered_output text,
  usage_metadata jsonb,
  finish_reason text,
  error_code text,
  error_message text,
  discord_channel_id text,
  discord_message_id text,
  discord_message_ids jsonb not null default '[]'::jsonb,
  feedback_window_end_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_strategic_review_runs_created_at
  on public.strategic_review_runs (created_at desc);

create index if not exists idx_strategic_review_runs_target_ymd
  on public.strategic_review_runs (target_ymd desc);

create index if not exists idx_strategic_review_runs_status_created_at
  on public.strategic_review_runs (status, created_at desc);

create table if not exists public.strategic_review_feedback (
  id bigserial primary key,
  review_run_id bigint not null references public.strategic_review_runs(id) on delete cascade,
  guild_id text not null,
  channel_id text not null,
  user_id text not null,
  source_message_id text,
  feedback_text text not null,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative', 'mixed')),
  feedback_summary text,
  classification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint strategic_review_feedback_source_message_unique unique (source_message_id)
);

create index if not exists idx_strategic_review_feedback_review_created_at
  on public.strategic_review_feedback (review_run_id, created_at desc);

create table if not exists public.strategic_review_evaluations (
  id bigserial primary key,
  review_run_id bigint not null references public.strategic_review_runs(id) on delete cascade,
  evaluator_model text not null,
  hard_gate_passed boolean not null default true,
  total_score integer,
  rubric_scores jsonb not null default '{}'::jsonb,
  hard_gate_failures jsonb not null default '[]'::jsonb,
  summary text,
  highest_priority_gap text,
  improvement_needed boolean not null default false,
  based_on_feedback boolean not null default false,
  raw_output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_strategic_review_evaluations_review_created_at
  on public.strategic_review_evaluations (review_run_id, created_at desc);

create table if not exists public.strategic_review_improvement_proposals (
  id bigserial primary key,
  review_run_id bigint references public.strategic_review_runs(id) on delete set null,
  evaluation_id bigint references public.strategic_review_evaluations(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'held', 'rejected', 'applied', 'expired')),
  title text not null,
  problem_summary text not null,
  as_is text not null,
  to_be text not null,
  expected_effect text not null,
  evidence jsonb not null default '[]'::jsonb,
  proposed_system_instruction_suffix text not null default '',
  proposed_prompt_instruction_suffix text not null default '',
  evaluation_score integer,
  approved_by_user_id text,
  decision_reason text,
  created_prompt_version_id bigint references public.strategic_review_prompt_versions(id) on delete set null,
  discord_channel_id text,
  discord_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_strategic_review_improvement_proposals_status_created_at
  on public.strategic_review_improvement_proposals (status, created_at desc);

comment on table public.agent_llm_logs is 'Raw Gemini API request/response logs stored by the Archy Ops Agent.';
comment on table public.strategic_review_prompt_versions is 'Versioned prompt deltas for daily strategic review generation.';
comment on table public.strategic_review_runs is 'Daily strategic review prompt/input/output records, including Discord linkage.';
comment on table public.strategic_review_feedback is 'Human feedback captured from Discord mentions about strategic reviews.';
comment on table public.strategic_review_evaluations is 'Rubric-based evaluations of strategic review quality.';
comment on table public.strategic_review_improvement_proposals is 'Prompt improvement proposals awaiting human approval or already applied.';
