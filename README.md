# ARIF PANEL PRO ONLINE

Mobile-friendly tournament management panel built with Node.js 20+, Express and SQLite.

## Features
- Public tournament listing and player registration
- Admin login with bcrypt password verification and rate limiting
- Admin dashboard, player management and tournament management
- Admin-only room ID/password storage and results entry
- SQLite database and SQLite-backed session store
- Same-origin check for browser write requests

## Run locally
1. Install Node.js 20 or newer.
2. In this folder run `npm install`.
3. Set environment variables (use your own strong secrets):
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD` = unique password of at least 14 characters
   - `SESSION_SECRET` = random secret of at least 32 characters
   - Optional: `DB_PATH=./data/arif-panel.sqlite`
4. Run `npm start`.
5. Open `http://localhost:3000`.

Do not use the example credentials below as real credentials. On Windows PowerShell:
```powershell
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="PUT-YOUR-OWN-STRONG-PASSWORD-HERE"
$env:SESSION_SECRET="PUT-A-RANDOM-SECRET-OF-AT-LEAST-32-CHARACTERS"
npm start
```

## Deploy online
Deploy this folder to a Node.js host that supports persistent disk storage. Configure:
- `NODE_ENV=production`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD` (14+ characters)
- `SESSION_SECRET` (32+ random characters)
- `DB_PATH=/var/data/arif-panel.sqlite`

Mount a persistent disk at `/var/data`, use HTTPS, and back up the database. The app is not publicly hosted just because these files exist; it becomes public only after you deploy it to a hosting provider. Keep the persistent disk attached across redeploys.

## Important limitations
- This is a tournament administration website, not a Free Fire/Garena integration.
- It does not modify game files, aim, headshots, anti-cheat, FPS or ping.
- No payment gateway, SMS OTP, CAPTCHA, participant-specific room visibility, or automated game results are included.
- Before large-scale public use, arrange a privacy notice/consent process, backups, monitoring and a security review. Room credentials are currently visible to the admin only.
