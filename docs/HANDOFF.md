# Handoff: bring RadiGym up on the owner's server

For a Claude Code session running **on the owner's server** (Ubuntu with Docker). Read
`CLAUDE.md` first (the owner's preferences: English and French only, ask before large work they
may not use, personal data never in this public repository).

## What the owner wants, in their words

> My app is up and running on my server, I can access it, talk to Claude within it, and share
> it with my wife.

And: **no pay-per-use API keys anywhere.** Claude comes through their own Claude plan, with
RadiGym as a connector inside Claude (`docs/MCP_REMOTE.md`), never an API key and never a Claude
Code setup token in the app (Anthropic's terms do not allow that token outside Claude Code).

## Where things stand

- RadiGym is this fork, branch `claude/amazing-euler-1t6w6f`: openGym turned into a running app
  (Today, Activities, Progress, Coach, interval timer with voice cues, Apple Health import).
- The iPhone app is installed from Xcode on the owner's Mac (`docs/IPHONE.md`). It needs a
  rebuild after pulling to get the latest screens; that happens on the Mac, not here.
- The owner may be away from home: do everything you can without them, and when a step needs
  them (a sign-in link, Face ID), say exactly what to tap, one step at a time.

## Do this

1. `git fetch && git checkout claude/amazing-euler-1t6w6f && git pull`.
2. Check the tools (`docs/SERVER_LINUX.md`, step 1): Docker with compose, Tailscale signed in.
   Install what is missing. A Tailscale sign-in link goes to the owner.
3. `scripts/radigym-server.sh setup`. It writes `.env` (the Tailscale https address, RadiGym's
   name, the first profile as admin, the Claude connector: `COMPOSE_PROFILES=mcp`, `MCP=on`),
   builds from this folder, starts, and opens it with Tailscale Funnel. If Funnel is not yet
   allowed, the owner opens the link it prints; then run `setup` again.
4. Check from outside: `curl -fsS https://<address>/api/health`, and that `/mcp` answers (a 401
   with `WWW-Authenticate` is right: it wants a sign-in).
5. Give the owner, one at a time:
   - Safari on the iPhone → the address → **Create new profile** (Face ID). Then run
     `scripts/radigym-server.sh lock` (invite only).
   - Safari → Settings → **Pair the mobile app** → the code into RadiGym's Settings →
     **Server & sync**.
   - Claude app → **Customize → Connectors → Add custom connector**: name RadiGym, address
     `https://<address>/mcp`, then Connect and sign in to RadiGym. Claude can then call
     `get_running_coach_brief` and `list_runs`: "How should I run this week?" works there.
   - For the wife: Safari → Settings → **Admin dashboard** → an invite code. She creates her own
     profile with it, pairs her RadiGym app, and adds the connector to her own Claude.
6. Tell the owner the address, what works, and anything that did not, with its error.

## If something breaks

`docker compose logs --tail 80`, `scripts/radigym-server.sh status`. Fix what is a fix; ask the
owner before anything large or anything that changes their machine beyond this folder, Docker and
Tailscale. Commit fixes to this branch and push.
