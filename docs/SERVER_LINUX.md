# RadiGym server on Ubuntu with Docker

For a PC that runs Ubuntu (on its own, or inside Windows with WSL) with Docker installed. Your own
RadiGym server: one account per person, synced between phones and browsers, the Claude coach on
your Claude account, and an `https://` address that works from anywhere through Tailscale Funnel.

`scripts/radigym-server.sh` does the server work. If Claude Code runs on the PC (step 0), Claude
can do all of it for you, from your phone, wherever you are.

## 0. Let Claude work on this PC (once, at the PC)

```bash
curl -fsSL https://claude.ai/install.sh | bash     # Claude Code
cd ~ && git clone -b claude/amazing-euler-1t6w6f https://github.com/radisaad/openGym.git
cd ~/openGym
claude                                             # sign in once, then /exit
claude remote-control                              # leave it running
```

With `claude remote-control` running, this PC and its `openGym` folder show up in the Claude app
on your phone and Mac: start a session there and tell it "follow docs/SERVER_LINUX.md". To keep it
running after you log out, start it inside `tmux` (`sudo apt install tmux`, then `tmux`, then the
command; detach with Ctrl+B then D).

## 1. Tools (skip what is there)

```bash
docker compose version                     # Docker with the compose plugin
sudo usermod -aG docker "$USER"            # docker without sudo (log out and in once)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                          # opens a sign-in link
```

## 2. Start RadiGym

```bash
cd ~/openGym
scripts/radigym-server.sh setup
```

It writes `.env` with the address (`https://<this-pc>.<tailnet>.ts.net`), builds RadiGym from this
folder (about 10 minutes the first time), starts it on port 8080, and opens it to the internet with
Tailscale Funnel. The first time, Tailscale prints a link to allow HTTPS and Funnel for your
account: open it, allow both, run `setup` again.

## 3. Your account, the iPhone app, your wife

1. On the iPhone, open the address in **Safari** → **Create new profile** (Face ID makes the
   passkey). The first profile is the admin.
2. `scripts/radigym-server.sh lock`: from now on new profiles need an invite.
3. Safari, signed in: Settings → **Pair the mobile app** shows a code. RadiGym app: Settings →
   **Server & sync** → the address and the code. What the app holds joins the account.
4. Your wife: Settings → **Admin dashboard** → an invite code; she creates her profile with it and
   pairs her app the same way.

## Every day

Nothing. Docker restarts RadiGym when the PC starts (`restart: unless-stopped`), Tailscale too.
On WSL, Ubuntu only runs while Windows keeps it going: in Windows, make a Task Scheduler task "At
startup" that runs `wsl -d Ubuntu --exec sleep infinity`.

```bash
scripts/radigym-server.sh update    # after Claude ships changes
scripts/radigym-server.sh status    # is it up, and the address
scripts/radigym-server.sh backup    # a dated archive in backups/
```

Data lives in `~/openGym/data` (never in git). Copy a backup somewhere else now and then.
