# fan-engage-frontend

Next.js frontend for upload, playback, radar, and analytics.

## Features
- Upload a match → enqueues background pipeline job
- Progress banner with resume (localStorage) while navigating away
- Match page:
  - Video with detection overlays, team coloring, pitch lines
  - Radar view with homography projection & Voronoi control zones
  - Analytics: Possession ribbon, Control zone (100% stacked area), Momentum

## Env
```
NEXT_PUBLIC_API_BASE=http://localhost:8000
```
## Run (dev via infra)
### from fan-engage-infra/
```
docker compose -f docker-compose.dev.yml up --build
```
### Frontend at http://localhost:3000

## Notes
- Uses simple polling for job status (`/jobs/{id}`)
- Analytics are fetched **after** job completion (fast endpoints)