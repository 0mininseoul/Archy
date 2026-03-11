# Archy Repository Guidance

## Terminology

- `Archy`
  - The user-facing product and service.
  - Refers to the voice-based documentation experience itself: recording, transcription, formatting, and saving to connected tools.

- `Archy Ops Agent`
  - The canonical name for the Railway-deployed internal operations agent that administers Archy.
  - Handles daily batch runs, metrics aggregation, Notion and Google Sheets updates, Discord reports, and operator requests through Discord mentions or commands.
  - `아키 운영 에이전트` is the preferred Korean name.
  - `아키 에이전트` is an accepted alias and should be interpreted as `Archy Ops Agent`.

## Interpretation Rules

- Do not treat `Archy` and `Archy Ops Agent` as the same actor.
- When a request says `아키가 ...`, interpret it as the product or user-facing service unless the context clearly indicates operations.
- When a request says `아키 운영 에이전트가 ...` or `아키 에이전트가 ...`, interpret it as the internal admin agent running on Railway.
