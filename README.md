# Family Vault

A private, self-hosted home for your family's important documents: passports, ID cards, insurance policies, tax returns, vehicle papers, school records, bills.

- **A folder per person, plus shared folders** (e.g. *Car Insurance*). Everyone signs in and sees their own documents; the admin sees everything.
- **Bring your own storage.** Link the family's **Dropbox** or **Google Drive**. Files uploaded in the app are copied there, and files you drop into a member's folder there are imported.
- **AI reads every upload.** It works out the document type, holder, number and expiry date, and makes the text searchable.
- **Reminders** before documents expire or premiums fall due, by email and in Google Calendar, plus a weekly family digest.
- **Ask questions** like "When does the car insurance expire?" and get answers with links to the documents.
- **Email documents in** by forwarding them to the family's address. This is optional and needs Postmark.
- **Insurance tracker** for premiums, maturity dates and payouts. Share a single document with a time-limited link.
- Works on phones and can be installed as an app (PWA).

One deployment serves one family. Your documents live in your own Supabase project and your own Dropbox or Google Drive.

## How access works

1. The **first person to sign in becomes the admin.**
2. The admin opens **Setup** and adds each family member's name and the email they sign in with, plus any shared folders.
3. After that, only emails on that list can create an account. Anyone else is turned away.

## Stack

TanStack Start (React 19, Vite) · Supabase (Postgres with row-level security, Auth, Storage, Realtime) · any OpenAI-compatible AI API (Gemini by default) · Resend for outgoing email · Postmark for incoming email (optional).

## Self-hosting

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the database schema from `supabase/migrations`, using either the CLI:
   ```sh
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   or by pasting each file, in order, into the SQL editor.
3. Under **Authentication → Providers**:
   - **Email** is on by default (magic-link sign-in).
   - To enable **Google** sign-in, add the Google client from step 3 below. Its redirect URI is the one Supabase shows there (`https://<ref>.supabase.co/auth/v1/callback`).
4. Under **Authentication → URL configuration**, set the Site URL to your `APP_URL` and add it to the redirect URLs.

### 2. Configure

```sh
cp .env.example .env
```

Fill in the Supabase keys, `APP_URL`, and the two generated secrets:

```sh
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY
openssl rand -hex 32      # CRON_SECRET
```

### 3. Cloud storage: Dropbox and/or Google Drive

You only need one. The admin picks one in **Setup → Cloud storage**.

**Dropbox**
1. Go to [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) → *Create app* → *Scoped access* → **App folder**.
2. Under *Permissions*, tick `files.metadata.read`, `files.content.read` and `files.content.write`, then submit.
3. Under *Settings*, add the redirect URI `https://<APP_URL>/api/public/storage/dropbox/callback`.
4. Optional, for instant imports: add the webhook URI `https://<APP_URL>/api/public/hooks/dropbox-inbound`.
5. Copy the app key and secret into `DROPBOX_APP_KEY` and `DROPBOX_APP_SECRET`.

**Google Drive (also used for Google Calendar reminders)**
1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the **Google Drive API** and the **Google Calendar API**.
2. Configure the OAuth consent screen. While it is in *Testing*, add each family member as a test user.
3. Create an **OAuth client ID** of type *Web application* with these redirect URIs:
   - `https://<APP_URL>/api/public/storage/google_drive/callback`
   - `https://<APP_URL>/api/public/google-calendar/callback`
   - `https://<ref>.supabase.co/auth/v1/callback` (only if you use Google sign-in)
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

When Drive is linked, the app creates a **Family Vault** folder in that Drive with a subfolder for each member and shared folder.

**How the mirror works:** each top-level folder in the Dropbox app folder, or in *Family Vault* on Drive, matches a member or shared folder by name. Subfolders are recreated in the app. Files at the top level, or in folders that don't match anyone, are skipped, and the sync report says why. Google Docs, Sheets and Slides are imported as PDFs.

### 4. AI

Set `AI_API_KEY`. By default the app uses Google Gemini through its OpenAI-compatible endpoint; you can get a key at [aistudio.google.com](https://aistudio.google.com/apikey). To use another provider, set `AI_BASE_URL` and `AI_MODEL`. Document reading needs a model that accepts images and PDFs.

### 5. Email (optional)

- **Outgoing** (expiry reminders and the weekly digest): create a [Resend](https://resend.com) account, verify your domain, and set `RESEND_API_KEY` and `EMAIL_FROM`.
- **Incoming** (forward documents to the vault): set up a [Postmark](https://postmarkapp.com) inbound server on a domain such as `docs.yourdomain.com`.
  - Point its webhook at `https://USER:PASSWORD@<APP_URL>/api/public/hooks/postmark-inbound`.
  - Set `POSTMARK_WEBHOOK_USER`, `POSTMARK_WEBHOOK_PASSWORD` and `VITE_INBOUND_EMAIL_DOMAIN`.
  - The admin then chooses the family address in **Family View**.

### 6. Run

```sh
npm install
npm run dev               # prints the local address; set APP_URL to match
```

Production:

```sh
npm run build
npm start                 # Node server from .output/
```

The build targets Node by default. Set `NITRO_PRESET` (for example `vercel`, `netlify` or `cloudflare-module`) to build for another host.

### 7. Scheduled jobs

Call these endpoints with `POST` and the header `x-cron-secret: <CRON_SECRET>`. Any scheduler works: cron, GitHub Actions, your host's cron, or Supabase `pg_cron` with `pg_net`.

| Endpoint | Suggested schedule | What it does |
| --- | --- | --- |
| `/api/public/hooks/send-reminders` | daily | Emails expiry reminders that are due |
| `/api/public/hooks/send-family-digest` | weekly | Emails everyone a summary of the coming week |
| `/api/public/hooks/storage-sync` | every 15–60 min | Imports new files from Dropbox / Google Drive |

Example:

```sh
curl -X POST -H "x-cron-secret: $CRON_SECRET" https://your-app.example.com/api/public/hooks/send-reminders
```

## First run

1. Open the app and sign in. You are now the admin.
2. Go to **Setup** → **Add me**, then add the rest of the family and any shared folders.
3. In **Cloud storage**, connect Dropbox or Google Drive, then press **Sync now**.
4. Upload a document and watch it get read, filed and scheduled for reminders.

## Security notes

- Every table uses row-level security. Members see their own documents and shared folders; admins see everything.
- Storage tokens are encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) and can only be read by the server.
- OAuth callbacks are tied to the admin who started them with a signed, short-lived state value.
- The service role key never reaches the browser. Keep `.env` out of version control.

## License

[MIT](LICENSE)
