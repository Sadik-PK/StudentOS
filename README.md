# StudentOS

StudentOS is a React/Vite student dashboard backed by an Express API, Better Auth, Prisma, and PostgreSQL. Student data is saved to the cloud database; the app does not cache account data in browser storage. An active API/database connection is required to load and save data.

## Requirements

- Node.js 22.12 or newer
- npm
- A Neon PostgreSQL database for cloud use
- Cloudflare R2 credentials to enable file uploads (optional)

## Local setup

1. Copy `.env.example` to `.env`.
2. Create a Neon project and database. Copy its pooled connection string to `DATABASE_URL` and its direct connection string to `DIRECT_URL`. Both values must include TLS (`sslmode=require`).
3. Generate an authentication secret, for example:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Set the output as `BETTER_AUTH_SECRET`. Keep it private and use a different value in each environment.
4. Set `BETTER_AUTH_URL=http://localhost:3001` and `FRONTEND_ORIGINS=http://localhost:8443`.
5. Install dependencies and generate/apply the database schema:

   ```powershell
   npm install
   npm run db:generate
   npm run db:migrate
   ```

6. Run the API and frontend in separate terminals:

   ```powershell
   npm run dev:server
   ```

   ```powershell
   npm run dev
   ```

The Vite development server proxies `/api` requests to `http://localhost:3001`. Register an account from the app. Better Auth handles registration, login, logout, and secure HTTP-only session cookies; credentials and session tokens are not stored in browser localStorage.

## Database and data model

`server/prisma/schema.prisma` contains the Better Auth models and user-owned profile, settings, subject, timetable, attendance, assignment, exam, grade/GPA, note, task, calendar, expense, study-session, notification, and uploaded-file models. Relations, user-scoped keys, indexes, timestamps, and cascading user deletion are defined in the schema. `StudentData` tracks optimistic concurrency revisions and one-time legacy migration status.

The existing React modules use the `AppState` contract in `src/types.ts`. `GET /api/state` loads that shape and `PUT /api/state` validates and atomically persists it into the normalized tables. Changes are automatically saved after a short debounce. A revision mismatch returns `409 Conflict`; the client keeps unsaved changes in memory and requires the user to export a backup or explicitly reload the cloud version rather than overwrite newer data. If connectivity fails, unsaved changes are not written to local storage and may be lost if the page closes before a successful save. All state and file routes authenticate the session and scope database queries by the authenticated user ID.

Each account's dashboard section order is stored with its user settings. Use **Arrange** on the dashboard to move sections up or down; changes save with the rest of the account state.

New accounts start with no timetable, attendance, assignments, exams, notes, grades, tasks, or expenses. The signed-in account name is used for the profile; Pomodoro durations remain as functional timer settings, with zero completed sessions.

`POST /api/state/migrate` accepts the prior `tenseos_v1` state only when the signed-in account has no existing cloud data. The migration is transactional and idempotent. The client removes the old `tenseos_v1` key only after loading the saved cloud state and confirming the migration marker. Invalid or unverified legacy data is left untouched for recovery; this key is only a one-time migration source, not ongoing app storage.

## Cloudflare R2

To enable file storage:

1. Create a private R2 bucket in Cloudflare.
2. Create an R2 API token restricted to that bucket with object read/write access.
3. Set `R2_ENDPOINT` to `https://<account-id>.r2.cloudflarestorage.com`, and configure `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` in the API environment.
4. Configure the bucket's CORS policy to allow `POST` from the deployed frontend origin and permit the `Content-Type` header. Keep the bucket private.

The API issues short-lived POST policies with a 20 MiB maximum and an allowlist of document/image MIME types. It verifies uploaded object size and content type before marking metadata complete. Download URLs are short-lived and only issued after checking that the file belongs to the authenticated user. R2 credentials remain server-side. When R2 is not configured, file endpoints return `503` rather than pretending uploads succeeded.

Endpoints:

- Better Auth: `/api/auth/*` (email/password registration, login, session, logout)
- Student data: `GET/PUT /api/state`, `POST /api/state/migrate`
- File storage: `POST /api/files/upload-url`, `POST /api/files/:id/complete`, `GET /api/files/:id/download-url`, `DELETE /api/files/:id`
- Health: `GET /api/health`

## Validation

```powershell
npm run build
npm run build:server
npm test
npm run db:generate
```

Prisma migration deployment should use:

```powershell
npm run db:deploy
```

## Deployment

### Vercel frontend and Render API

The root `vercel.json` and `render.yaml` configure Vercel to serve the frontend and proxy `/api/*` requests to the Render API. This keeps browser authentication same-origin.

1. Push the project to GitHub and import the repository into Vercel. Vercel detects Vite and builds with `npm run build` to `dist`.
2. Leave `VITE_API_URL` unset in Vercel so browser requests use the same-origin API proxy.
3. Create a Render Blueprint from the same repository using `render.yaml`.
4. In Render, set `DATABASE_URL` to the Neon pooled connection string and `DIRECT_URL` to the direct connection string. The blueprint sets `FRONTEND_ORIGINS` to the deployed Vercel production origin; update it if your Vercel domain changes. Render generates `BETTER_AUTH_SECRET`; the blueprint sets `BETTER_AUTH_URL` for `https://studentos-api.onrender.com`.
5. If Render assigns a different service hostname, update `BETTER_AUTH_URL` in `render.yaml` and the API rewrite destination in `vercel.json`. Redeploy both services after changes.
6. The Render start command runs `prisma migrate deploy` before starting the API. Check the Render health endpoint at `/api/health` and test registration, login, and cloud save from the Vercel site.

File uploads require configuring all four R2 environment variables on Render; they are optional for the rest of the app. Never add database, authentication, or R2 secrets to Vercel `VITE_*` variables or commit `.env` files.

## Environment variables

See `.env.example` for the complete variable list. The frontend build only receives `VITE_API_URL`; all database, auth secret, and R2 values belong exclusively in the server environment.
