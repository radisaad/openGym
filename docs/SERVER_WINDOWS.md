# RadiGym server on a Windows 11 laptop

Your own RadiGym server at home: your runs in one place, synced between your iPhone, your wife's
phone and any browser, and later the in-app Claude coach and Strava. It is free: Docker Desktop
runs the server, and Tailscale Funnel gives it a fixed `https://` address that works from
anywhere, with a real certificate (needed for passkeys and the iPhone app), no router settings
and no domain to buy.

Everything runs from this repository folder, built from RadiGym's own source.
`scripts\radigym-server.ps1` does the server work; the steps below are the parts only you can click.

## 1. The laptop (once, 5 minutes)

- **Power**: Settings → System → Power: *Screen and sleep* → **Never** when plugged in.
  Control Panel → Power Options → *Choose what closing the lid does* → **Do nothing** (plugged in).
- **Updates**: Settings → Windows Update → Advanced options → *Active hours*: set them to when
  you run, so a restart for updates happens at night.
- Keep it plugged in. Wi-Fi is fine; a cable is better.

## 2. Install three things (once, 15 minutes)

1. **Git for Windows**: https://git-scm.com/download/win (all the defaults).
2. **Docker Desktop**: https://www.docker.com/products/docker-desktop. Accept the WSL 2 option it
   offers, restart when it asks. Then in Docker Desktop: Settings → General → **Start Docker
   Desktop when you sign in** on. Free for personal use.
3. **Tailscale**: https://tailscale.com/download/windows. Sign in (an Apple or Google account is
   fine). In its taskbar menu: **Run unattended** on, so it stays connected without you logged in.

## 3. Get RadiGym (once)

Open **PowerShell** (Start → type PowerShell) and paste:

```powershell
cd $HOME
git clone -b claude/amazing-euler-1t6w6f https://github.com/radisaad/openGym.git
cd openGym
```

## 4. Start the server

```powershell
powershell -ExecutionPolicy Bypass -File scripts\radigym-server.ps1 setup
```

It writes the settings (`.env`), builds RadiGym (the first time takes about 10 minutes), starts
it, and opens it to the internet over Tailscale Funnel. The first time, Tailscale prints a link to
**enable HTTPS and Funnel** for your account: open it, allow both, and run the same command again.
At the end it shows your address, like `https://your-laptop.tail1234.ts.net`.

## 5. Your account, and the iPhone app

1. On the iPhone, open that address in **Safari**, tap **Create new profile** and let Face ID make
   the passkey. The first profile is the admin.
2. Back on the laptop, close sign-ups to strangers:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\radigym-server.ps1 lock
   ```
3. In Safari, still signed in: Settings → **Pair the mobile app**. It shows a short code.
4. In the RadiGym app: Settings → **Server & sync** → connect, type the address, enter the code.
   What the app already holds (your imported runs) is added to the account.

Your wife: in Safari, Settings → **Admin dashboard** → make an invite code; she creates her own
profile with it on her phone, and pairs her app the same way.

## Every day

Nothing: the server starts with Windows (Docker Desktop and Tailscale both do). If the laptop was
off, the app waits and syncs once it is back.

```powershell
cd $HOME\openGym
powershell -ExecutionPolicy Bypass -File scripts\radigym-server.ps1 update   # after Claude ships changes
powershell -ExecutionPolicy Bypass -File scripts\radigym-server.ps1 status   # is it up, and its address
powershell -ExecutionPolicy Bypass -File scripts\radigym-server.ps1 backup   # a dated zip in backups\
```

Your data lives in `openGym\data`. Back it up now and then (`backup`, then copy the zip somewhere
else, such as iCloud Drive). It never goes into the repository (`.gitignore`).

## When something fails

- **"Docker Desktop is not running"**: open Docker Desktop, wait for *Engine running*.
- **"Tailscale is not connected"**: open Tailscale from the taskbar, sign in.
- **The build fails**, or the app says it cannot reach the server: copy the last lines PowerShell
  printed (or `docker compose logs --tail 80`) to Claude.
