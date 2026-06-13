# Hostinger deploy — fix version 2.3.2 / chat-status 404

If you see:
- `https://apps.freebusinessgip.com/api/health` → **version 2.3.2**
- `https://apps.freebusinessgip.com/api/stream/chat-status` → **Cannot GET**

Then the **old backend is still running**. The new code is **not** active yet.

---

## Use the correct folder on your PC

Upload from this folder only:

```
C:\Users\tayya\OneDrive\Desktop\Free Business\backend
```

**Do NOT upload** `backend -updated1` (that folder is old 2.3.2).

---

## Files that MUST exist on Hostinger after upload

| File | Required |
|------|----------|
| `server.js` | version **2.4.0** inside |
| `services/streamChatService.js` | **NEW** — chat fix |
| `services/streamGroupService.js` | group chat sync |
| `routes/streamToken.js` | has `/stream/chat-status` |
| `controllers/groupController.js` | has `syncGroupChat` |
| `package.json` | has `stream-chat` dependency |

---

## Step-by-step (Hostinger)

### 1. Upload files

**hPanel → Files → File Manager** → open your Node app folder (often something like):

- `domains/apps.freebusinessgip.com/public_html`
- or `nodejs/your-app-name`

**Replace** these from your PC `backend` folder:

1. `server.js`
2. Whole folder `services/` (especially `streamChatService.js`)
3. Whole folder `routes/`
4. Whole folder `controllers/`
5. `package.json`

Keep your existing `.env` on the server (do not delete it).

Do **not** upload `node_modules` from PC — run `npm install` on the server instead.

---

### 2. Install dependencies (SSH or Hostinger Terminal)

```bash
cd /home/YOUR_USER/domains/apps.freebusinessgip.com/public_html
# ^ use YOUR real path — check where server.js lives

npm install
```

Wait until it finishes with no errors.

---

### 3. Restart Node (required — upload alone is NOT enough)

**Option A — PM2 (SSH):**

```bash
pm2 list
pm2 restart all
pm2 logs --lines 30
```

You should see in logs:

```
API version: 2.4.0 (chat fix)
```

**Option B — Hostinger hPanel:**

1. **Websites** → your site → **Advanced** → **Node.js**
2. Check **Application root** points to the folder where you uploaded `server.js`
3. **Application startup file** = `server.js`
4. Click **Restart** (or Stop → Start)

---

### 4. Verify in browser

Open these URLs:

| URL | Expected |
|-----|----------|
| https://apps.freebusinessgip.com/api/health | `"version": "2.4.0"`, `"chatFix": "2.4.0"` |
| https://apps.freebusinessgip.com/api/stream/chat-status | JSON with `"chatFix": "2.4.0"` |

If health still shows **2.3.2**, you are either:
- editing the wrong folder on Hostinger, or
- Node was not restarted, or
- hPanel Node app points to a **different** directory than where you uploaded

---

## Find the correct folder on Hostinger

SSH:

```bash
find ~ -name "server.js" 2>/dev/null
```

Open each result and check if `version` in the file is `2.4.0`:

```bash
grep "2.4.0" /path/to/server.js
```

Upload the new files to **that** folder, then restart.

---

## Quick test after deploy

1. Log out of the app → log in again  
2. Open **group chat** or **1:1 chat**  
3. Should open without permission error  

---

## Still stuck?

Send Hostinger support (or check yourself):

1. Full path where `server.js` runs  
2. Output of `pm2 list`  
3. Output of `grep version server.js` in that folder  

Common fix: **Application root** in Node.js settings was pointing to an old copy of the backend.
