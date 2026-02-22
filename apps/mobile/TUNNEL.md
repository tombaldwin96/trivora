# Running Expo with tunnel (remote dev)

Use tunnel when your device and PC are not on the same network (e.g. phone on cellular, or testing from another location).

## Fix for "Cannot read properties of undefined (reading 'body')"

Expo’s tunnel uses ngrok; that error often means the tunnel service didn’t get a valid auth token. Use **your own free ngrok account** and one of the options below.

### 1. Get an ngrok auth token

1. Sign up: [ngrok.com](https://ngrok.com)
2. Copy your authtoken: [dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)

### 2. Use the token

**Option A – .env (try first)**  

Add to `apps/mobile/.env` (no quotes, no spaces around `=`):

```env
NGROK_AUTHTOKEN=your_token_here
```

Then run:

```bash
cd apps/mobile
pnpm run tunnel
```

You should see: `Tunnel: using NGROK_AUTHTOKEN from .env`. If the error persists, use Option B.

**Option B – ngrok config (most reliable)**  

So the ngrok binary uses your token from its config, run once:

```bash
npx ngrok config add-authtoken YOUR_TOKEN
```

Or install ngrok and run the same (e.g. Windows: `winget install ngrok.ngrok` or download from ngrok.com):

```bash
ngrok config add-authtoken YOUR_TOKEN
```

Then run `pnpm run tunnel` again.

**Option C – Set env in the shell**  

Windows (PowerShell):

```powershell
$env:NGROK_AUTHTOKEN="your_token"; pnpm run dev -- --tunnel
```

Git Bash / WSL:

```bash
export NGROK_AUTHTOKEN=your_token
pnpm run dev -- --tunnel
```

### 3. If it still fails

- **Retry** – Tunnel services sometimes fail; try again in a few minutes.
- **Same network** – Use `pnpm run dev` (no tunnel) and connect over LAN or mobile hotspot.
- **WSL (Windows)** – Run `pnpm run tunnel` from WSL; tunnel often works better there than in PowerShell.

### 4. Open the app

After the tunnel starts, scan the QR code with Expo Go (or enter the `exp://` URL). The app will load over the tunnel.

---

**Scripts**

- `pnpm run dev` – Start Expo (add `-- --tunnel` for tunnel)
- `pnpm run tunnel` – Start with tunnel (loads `.env` and uses `NGROK_AUTHTOKEN`)
- `pnpm run lan` – Start with LAN only
