-- Supabase tables for Discord assistant conversational memory.
-- Run in SQL Editor before enabling memory features in production.

create table if not exists public.agent_memory_threads (
  id bigserial primary key,
  guild_id text not null,
  channel_id text not null,
  user_id text not null,
  latest_summary text,
  summary_updated_at timestamptz,
  summary_source_model text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint agent_memory_threads_unique_scope unique (guild_id, channel_id, user_id)
);

create index if not exists idx_agent_memory_threads_scope
  on public.agent_memory_threads (guild_id, channel_id, user_id);

create index if not exists idx_agent_memory_threads_updated_at
  on public.agent_memory_threads (updated_at desc);

create table if not exists public.agent_memory_messages (
  id bigserial primary key,
  thread_id bigint not null references public.agent_memory_threads(id) on delete cascade,
  guild_id text not null,
  channel_id text not null,
  user_id text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_agent_memory_messages_thread_created_at
  on public.agent_memory_messages (thread_id, created_at desc);

create index if not exists idx_agent_memory_messages_scope_created_at
  on public.agent_memory_messages (guild_id, channel_id, user_id, created_at desc);

create table if not exists public.agent_memory_facts (
  id bigserial primary key,
  guild_id text not null,
  user_id text not null,
  fact_key text not null,
  fact_value text not null,
  fact_type text not null default 'general',
  confidence numeric(3,2) not null default 0.70,
  source text not null default 'conversation_summary',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint agent_memory_facts_unique_key unique (guild_id, user_id, fact_key)
);

create index if not exists idx_agent_memory_facts_scope_updated_at
  on public.agent_memory_facts (guild_id, user_id, updated_at desc);

comment on table public.agent_memory_threads is 'Per-user conversation scope for Archy Discord agent.';
comment on table public.agent_memory_messages is 'Chronological conversation turns for retrieval context.';
comment on table public.agent_memory_facts is 'Persisted user/project facts extracted from conversation summaries.';
