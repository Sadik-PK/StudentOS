# StudentOS

StudentOS is a React/Vite student dashboard backed by an Express API, Better Auth, Prisma, and PostgreSQL. Student data is saved to the cloud database; the app does not cache account data in browser storage. An active API/database connection is required to load and save data.

## Requirements

- Node.js 22.12 or newer
- npm
- A Neon PostgreSQL database for cloud use
- An app-owned Google Drive OAuth client and refresh token to enable file uploads (optional)
- A Gemini or OpenAI API key configured on the API server to enable AI tools

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

`server/prisma/schema.prisma` contains the Better Auth models and user-owned profile, settings, subject, timetable, attendance, assignment, exam, grade/GPA, note, task, calendar, expense, study-session, notification, uploaded-file, and AI study models. Relations, user-scoped keys, indexes, timestamps, and cascading user deletion are defined in the schema. `StudentData` tracks optimistic concurrency revisions and one-time legacy migration status.

The existing React modules use the `AppState` contract in `src/types.ts`. `GET /api/state` loads that shape and `PUT /api/state` validates and atomically persists it into the normalized tables. Changes are automatically saved after a short debounce. A revision mismatch returns `409 Conflict`; the client keeps unsaved changes in memory and requires the user to export a backup or explicitly reload the cloud version rather than overwrite newer data. If connectivity fails, unsaved changes are not written to local storage and may be lost if the page closes before a successful save. All state and file routes authenticate the session and scope database queries by the authenticated user ID.

Each account's dashboard section order is stored with its user settings. Use **Arrange** on the dashboard to move sections up or down; changes save with the rest of the account state.

New accounts start with no timetable, attendance, assignments, exams, notes, grades, tasks, or expenses. The signed-in account name is used for the profile; Pomodoro durations remain as functional timer settings, with zero completed sessions.

`POST /api/state/migrate` accepts the prior `tenseos_v1` state only when the signed-in account has no existing cloud data. The migration is transactional and idempotent. The client removes the old `tenseos_v1` key only after loading the saved cloud state and confirming the migration marker. Invalid or unverified legacy data is left untouched for recovery; this key is only a one-time migration source, not ongoing app storage.

## Google Drive file storage

Google Drive stores file blobs only; authentication, application data, AI processing, and database records remain on Render/Neon. The API uses a single app-owned Google Drive account with the Drive API and an OAuth refresh token. StudentOS keeps per-user file ownership in PostgreSQL, stores files as private Drive objects under the configured account, and only downloads or deletes a Drive object after checking the authenticated user's database record. Google credentials stay on Render; the browser never receives Drive tokens.

To configure storage:

1. In Google Cloud Console, create/select a project and enable the **Google Drive API**.
2. Configure the OAuth consent screen and create a Web application OAuth client ID/secret.
3. Add this exact URI to **Authorized redirect URIs** in Google Cloud Console and to Render's `GOOGLE_DRIVE_REDIRECT_URI`:

   ```text
   https://studentos-api-hkml.onrender.com/api/integrations/google-drive/callback
   ```

4. Configure `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REDIRECT_URI`, `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY`, and `GOOGLE_DRIVE_ADMIN_EMAIL` on the Render API. Generate the encryption key with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Set `GOOGLE_DRIVE_ADMIN_EMAIL` to the verified email on the trusted StudentOS administrator account. The OAuth setup routes deny all other users. This project does not automatically verify account emails, so independently verify ownership before treating an account as an administrator.
5. Sign into StudentOS as that administrator and open `/api/integrations/google-drive/connect`. Approve the requested `https://www.googleapis.com/auth/drive.file` scope. The callback validates a short-lived HttpOnly, Secure, SameSite=Lax state cookie against a one-time hashed database state record, then exchanges the authorization code, verifies Drive API access, and encrypts the refresh token in PostgreSQL. The callback does not require the StudentOS session; the state record is bound to the verified administrator who initiated the flow. `GOOGLE_DRIVE_REFRESH_TOKEN` remains supported as an existing server-side fallback; the OAuth flow does not alter Render environment variables.
6. Optionally set `GOOGLE_DRIVE_FOLDER_ID` to a folder accessible to the OAuth client; otherwise files are stored in that account's Drive root. Keep OAuth credentials and the token-encryption key on Render only, never in Vercel variables or frontend code.

The API relays uploads (20 MiB maximum) to Drive and validates the declared MIME type and file signature. Download, upload, and delete operations use authenticated Render endpoints. The AI indexing worker downloads the same Drive file through the server API layer, so PDF, DOCX, and TXT documents can be extracted and analyzed without public links.

Files stored by an earlier provider are not copied automatically. Before switching an existing deployment, copy those files to the app-owned Drive account and update their database object references, or expect existing attachments to stop opening. Do not delete the old provider's files until the migration is verified.

The admin-only endpoints are `GET /api/integrations/google-drive/connect`, `GET /api/integrations/google-drive/callback`, and `POST /api/integrations/google-drive/disconnect`. Disconnect disables the stored credential and stops Drive operations; it does not delete any Drive files. Render must deploy the migration that adds encrypted credential storage before using OAuth.

Endpoints:

- Better Auth: `/api/auth/*` (email/password registration, login, session, logout)
- Student data: `GET/PUT /api/state`, `POST /api/state/migrate`
- File storage: `POST /api/files/upload-url`, authenticated `PUT /api/files/:id/content`, `GET /api/files/:id/download-url`, `GET /api/files/:id/download`, `DELETE /api/files/:id`
- AI Study Assistant: authenticated `/api/ai` routes for course documents, conversations, streaming chat, summaries, flashcards, quizzes, explanations, and exam preparation
- Health: `GET /api/health`

## AI Study Assistant

The assistant stores conversations, course documents, extracted chunks, flashcards, quiz history, and usage records in dedicated user-scoped PostgreSQL tables. Document blobs are stored in the app-owned Google Drive account; the Render API downloads those blobs for extraction and indexing, so AI analysis does not need public file URLs. AI indexing supports PDF, DOCX, and TXT; other accepted file types remain available for normal attachments but are not parsed as study sources. PDF pages keep page references; DOCX and TXT are cited by filename because those formats do not reliably carry rendered page numbers. Scanned PDFs require OCR and are reported as unprocessable rather than treated as searchable text.

The backend provider abstraction supports Gemini and OpenAI. Gemini is the default. Configure `AI_PROVIDER=gemini` and `GEMINI_API_KEY`, or use `AI_PROVIDER=openai` and `OPENAI_API_KEY`. `AI_GEMINI_MODEL` and `AI_OPENAI_MODEL` choose the chat models. Keys stay server-side and must be configured on Render, never as Vercel `VITE_*` variables. Embeddings use Gemini `gemini-embedding-001` or OpenAI `text-embedding-3-small`, with 768 dimensions matching the pgvector schema. Switching embedding providers or models requires reprocessing existing documents.

AI endpoints enforce authenticated ownership, a database-backed per-user request limit, provider timeouts, streaming for chat, and per-user token/operation usage records. The migration enables PostgreSQL's `vector` extension and creates the dedicated AI tables. Render applies migrations on service startup with `npm run db:deploy`.

To enable file uploads and AI document analysis, configure the Google Drive client ID and secret, redirect URI, token-encryption key, and verified administrator email on the Render API, then complete the admin OAuth flow. Until Drive credentials are available, file upload requests return an explicit unavailable error. Chat without processed documents can still provide general explanations while stating that course sources were unavailable.

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
4. In Render, set `DATABASE_URL` to the Neon pooled connection string and `DIRECT_URL` to the direct connection string. The blueprint sets `FRONTEND_ORIGINS` to the deployed Vercel production origin; update it if your Vercel domain changes. Render generates `BETTER_AUTH_SECRET`; the blueprint sets `BETTER_AUTH_URL` to the API service's public URL.
5. If Render assigns a different service hostname, update `BETTER_AUTH_URL` in `render.yaml` and the API rewrite destination in `vercel.json`. Redeploy both services after changes.
6. The Render start command runs `prisma migrate deploy` before starting the API. Check the Render health endpoint at `/api/health` and test registration, login, and cloud save from the Vercel site.

File uploads and document-based AI require configuring Google Drive OAuth on Render; they are optional for the rest of the app. AI generation requires a valid Gemini or OpenAI API key on Render. Never add database, authentication, AI-provider, or Google OAuth secrets to Vercel `VITE_*` variables or commit `.env` files.

## Environment variables

See `.env.example` for the complete variable list. The frontend build only receives `VITE_API_URL`; all database, auth, AI-provider, and Google Drive credentials belong exclusively in the server environment.
