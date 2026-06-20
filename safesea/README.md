# SafeSea — Full-Stack Maritime Navigation System

The original single-file SafeSea prototype has been converted into a complete
full-stack application. **The UI is preserved exactly** (same HTML, CSS, fonts,
Leaflet map, risk engine, multilingual voice, alert overlay, themes) — every
piece of mock data has been replaced with database-driven REST APIs and live
Socket.IO vessel tracking.

## Stack

| Layer     | Technology                                  |
|-----------|---------------------------------------------|
| Frontend  | React + Vite, served by nginx               |
| Backend   | Node.js + Express                           |
| Database  | PostgreSQL 16                               |
| Auth      | JWT (Bearer tokens, bcrypt password hashes) |
| Realtime  | Socket.IO (live vessel positions)           |
| Packaging | Docker + docker-compose                     |

## Run it

```bash
docker-compose up
```

Then open **http://localhost:8080**

| Service   | URL                         |
|-----------|-----------------------------|
| Frontend  | http://localhost:8080       |
| Backend   | http://localhost:4000       |
| Postgres  | localhost:5432              |

The backend waits for Postgres to be healthy, applies the schema, and seeds the
database on first run (seeding is skipped on later restarts so data is never
duplicated).

## Default logins

| Role       | Username      | Password   |
|------------|---------------|------------|
| Fisherman  | `fisher_001`  | `pass123`  |
| Crew       | `crew_001`    | `crew123`  |
| Admin      | `admin`       | `admin123` |

(The role buttons on the login screen prefill these credentials, exactly as in
the original prototype.)

## REST API

All `/api/*` routes except auth require an `Authorization: Bearer <token>` header.

| Method | Endpoint                       | Description                                  |
|--------|--------------------------------|----------------------------------------------|
| POST   | `/api/auth/login`              | Authenticate, returns `{ token, user }`      |
| POST   | `/api/auth/signup`             | Create an account                            |
| GET    | `/api/vessels`                 | Fleet list (also streamed via Socket.IO)     |
| GET    | `/api/vessels/:vesselId`       | Single vessel                                |
| GET    | `/api/notifications`           | Alert/notification feed                      |
| GET    | `/api/messages/inbox`          | Messages addressed to the current user       |
| GET    | `/api/messages/sent`           | Messages sent by the current user            |
| POST   | `/api/messages`                | Compose a message to the Coast Guard admin   |
| POST   | `/api/messages/:id/reply`      | Admin replies to a received message          |
| POST   | `/api/sos`                     | Broadcast an SOS (event + message + alert)   |
| GET    | `/api/sos`                     | Recent SOS events                            |
| GET    | `/api/users/me`                | Current user profile                         |
| GET    | `/api/users`                   | All users (admin only)                       |

### Socket.IO events (real-time vessel tracking)

- `vessels:update` — full fleet with updated positions/risk/zone (every 2s, and once on connect)
- `notification:new` — pushed when an SOS is broadcast

## Project layout

```
safesea/
├── docker-compose.yml
├── db/
│   ├── schema.sql          # tables: users, vessels, notifications, messages, sos_events
│   └── seed.sql            # seed users (bcrypt-hashed), vessels, notifications
├── backend/
│   ├── Dockerfile
│   └── src/
│       ├── index.js        # Express app + Socket.IO + vessel simulation
│       ├── db.js           # pg pool, startup init (schema + seed-once)
│       ├── middleware/auth.js
│       └── routes/         # auth, vessels, notifications, messages, sos, users
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── index.html
    └── src/
        ├── App.jsx         # mounts the exact UI + boots the API-driven logic
        ├── main.jsx
        ├── styles.css      # original CSS, untouched
        ├── markup.html     # original markup, untouched
        └── safesea-logic.js# original logic, mock data swapped for API + Socket.IO
```

## How the UI stayed identical

`frontend/src/markup.html` and `frontend/src/styles.css` are the original body
and stylesheet verbatim. `App.jsx` injects that markup and then runs
`safesea-logic.js` as a classic script (so the original inline `onclick`
handlers keep working). Only the data layer changed:

- the hardcoded `VESSELS` array → `GET /api/vessels` + `vessels:update` socket feed
- the inline notifications array → `GET /api/notifications`
- the login role table → `POST /api/auth/login` (JWT)
- inbox / sent / reply / SOS → `/api/messages` and `/api/sos`

## Configuration

The frontend points at the backend using `window.SAFESEA_API`
(`<host>:4000`, set in `index.html`). Backend settings (`PGHOST`, `JWT_SECRET`,
`PORT`, …) are provided by `docker-compose.yml` and can be overridden via
environment variables.
