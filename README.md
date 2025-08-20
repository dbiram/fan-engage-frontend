# Fan Engage — Frontend (Next.js)

Minimal Next.js UI
- `/` – list matches (from API)
- `/match/[id]` – video page, uses **presigned URL** from API (Phase 1)
  - Or switch to `/media/{id}` if you prefer API streaming

## Env
Frontend reads:
- `NEXT_PUBLIC_API_BASE` (e.g., `http://localhost:8000`)

## Dev flow
- Run through infra compose (hot reload recommended with a bind mount).
- Rebuild only frontend:
    ```bash
    docker compose -f ../fan-engage-infra/docker-compose.dev.yml up -d --build frontend
    ```
- Or in dev with bind mount, Next.js reloads on save.