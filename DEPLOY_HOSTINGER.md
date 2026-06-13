# Deploy backend to Hostinger (fix Groups, Rewards, Messages, Chat)

Your live API at `https://apps.freebusinessgip.com` must run **backend v2.4.0**.

> **Wrong folder warning:** Use `backend` on your PC — NOT `backend -updated1` (that is old 2.3.2).

After deploy, these URLs must work:

- `https://apps.freebusinessgip.com/api/health` → `"version": "2.4.0"`
- `https://apps.freebusinessgip.com/api/stream/chat-status` → `"chatFix": "2.4.0"`

See **HOSTINGER_FIX_DEPLOY.md** if you still see 2.3.2 or chat-status 404.

Expected JSON from `/api/health`:

```json
{
  "ok": true,
  "version": "2.4.0",
  "chatFix": "2.4.0",
  "features": {
    "social": true,
    "groups": true,
    "rewards": true,
    "stream": true,
    "directChannelRoute": true,
    "groupSyncRoute": true
  }
}
```

## Steps

1. Upload the entire `backend` folder to Hostinger (replace old files).
2. SSH or terminal in the backend directory:

```bash
npm install
```

3. Create or update `.env` (never commit real secrets to git):

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_secret

STREAM_APP_ID=1612104
STREAM_API_KEY=your_stream_api_key
STREAM_API_SECRET=your_stream_api_secret

# Optional – avatar uploads to Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

4. Restart Node (PM2 example):

```bash
pm2 restart all
# or
pm2 start server.js --name freebusiness-api
```

5. Ensure `uploads/` folder exists and is writable if not using Cloudinary.

6. Open `https://apps.freebusinessgip.com/api/health` — must show `"version": "2.4.0"` and `"chatFix": "2.4.0"`.

7. Open `https://apps.freebusinessgip.com/api/stream/chat-status` — must show `"chatFix": "2.4.0"`.

8. Reload the mobile app and **log out / log in** once after backend deploy.

## Routes required by the app

| Feature | Method | Path |
|---------|--------|------|
| Groups list | GET | `/api/social/groups` |
| Create group | POST | `/api/social/groups` |
| Avatar upload | POST | `/api/social/profile/avatar` |
| Rewards | GET | `/api/rewards/my-progress` |
| Stream chat token | POST | `/api/stream/token` (Bearer JWT) |
| Prepare 1:1 chat | POST | `/api/stream/channel/direct` (Bearer JWT) |
| Prepare group chat | POST | `/api/social/groups/:groupId/sync-chat` (Bearer JWT) |
| Chat deploy check | GET | `/api/stream/chat-status` |
| Delete account | DELETE | `/api/users/account` (body: `{ password }`) |
| Privacy policy (web) | GET | `/privacy` |

If any of these return **404**, the server code on Hostinger is still outdated.
