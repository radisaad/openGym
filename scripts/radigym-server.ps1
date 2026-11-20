# RadiGym server on Windows (docs/SERVER_WINDOWS.md). Run from the repository folder:
#
#   powershell -ExecutionPolicy Bypass -File scripts\radigym-server.ps1 setup    first time: .env, build, start, HTTPS
#   powershell -ExecutionPolicy Bypass -File scripts\radigym-server.ps1 lock     after your profile exists: invite only
#   powershell -ExecutionPolicy Bypass -File scripts\radigym-server.ps1 update   pull the latest RadiGym and rebuild
#   powershell -ExecutionPolicy Bypass -File scripts\radigym-server.ps1 status   what runs, and the address
#   powershell -ExecutionPolicy Bypass -File scripts\radigym-server.ps1 backup   a dated copy of the data folder
#
# Needs Docker Desktop (running) and Tailscale (signed in). The address is the laptop's Tailscale
# name, https://<laptop>.<tailnet>.ts.net, served to the internet by Tailscale Funnel: HTTPS with
# a real certificate, which passkeys and the iPhone app need, and no router or domain to set up.

param([Parameter(Position = 0)][ValidateSet('setup', 'lock', 'update', 'status', 'backup')][string]$Command = 'status')

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$EnvFile = Join-Path $Root '.env'
$Port = 8080

function Say($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "`n!! $text" -ForegroundColor Red; exit 1 }

function Tailscale {
  $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $default = 'C:\Program Files\Tailscale\tailscale.exe'
  if (Test-Path $default) { return $default }
  Fail 'Tailscale is not installed. Get it from https://tailscale.com/download/windows and sign in.'
}

function Need-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'Docker is not installed. Install Docker Desktop (docs/SERVER_WINDOWS.md, step 2).' }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { Fail 'Docker Desktop is not running. Start it, wait for "Engine running", and try again.' }
}

function Host-Name {
  $ts = Tailscale
  $json = & $ts status --json 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $json) { Fail 'Tailscale is not connected. Open Tailscale from the taskbar and sign in.' }
  $name = ($json | ConvertFrom-Json).Self.DNSName
  if (-not $name) { Fail 'Tailscale gave no name for this laptop. Is it signed in?' }
  return $name.TrimEnd('.')
}

# Sets KEY=value in .env, keeping every other line as it is.
function Set-Env($key, $value) {
  $lines = @()
  if (Test-Path $EnvFile) { $lines = @(Get-Content $EnvFile) }
  $found = $false
  # @(…) keeps it a list even with one line, so += adds a line rather than gluing text on.
  $lines = @($lines | ForEach-Object { if ($_ -match "^\s*$key=") { $found = $true; "$key=$value" } else { $_ } })
  if (-not $found) { $lines += "$key=$value" }
  # UTF-8 without a byte-order mark and with Unix line ends: docker compose reads it either way,
  # and the file stays the same on every machine.
  [IO.File]::WriteAllText($EnvFile, (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
}

function Wait-Healthy {
  Say 'Waiting for RadiGym to answer'
  for ($i = 0; $i -lt 60; $i++) {
    try { if ((Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/api/health" -TimeoutSec 3).StatusCode -eq 200) { Write-Host 'RadiGym answers.'; return } } catch { }
    Start-Sleep -Seconds 3
  }
  Fail "RadiGym did not answer on port $Port. Look at: docker compose logs --tail 80"
}

function Funnel {
  $ts = Tailscale
  Say 'Opening https on Tailscale Funnel'
  & $ts funnel --bg $Port
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Tailscale needs Funnel switched on for your account once. Open the link it printed above,'
    Write-Host 'allow HTTPS certificates and Funnel, then run this command again.'
    exit 1
  }
}

switch ($Command) {
  'setup' {
    Need-Docker
    $hostName = Host-Name
    Say "This server will be https://$hostName"
    Set-Env 'RP_ID' $hostName
    Set-Env 'ORIGIN' "https://$hostName"
    Set-Env 'RP_NAME' 'RadiGym'
    Set-Env 'WEB_PORT' "$Port"
    Set-Env 'FIRST_USER_ADMIN' '1'
    Say 'Building RadiGym from this folder and starting it (the first build takes several minutes)'
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { Fail 'The build failed. Copy the last lines above to Claude.' }
    Wait-Healthy
    Funnel
    Say 'Done'
    Write-Host "1. On your iPhone, open https://$hostName in Safari and create your profile (Face ID makes the passkey)."
    Write-Host '2. Then run:  powershell -ExecutionPolicy Bypass -File scripts\radigym-server.ps1 lock'
    Write-Host '3. In the RadiGym app: connect to a server, type the address above, and pair with the code'
    Write-Host '   from Settings > Pair the mobile app, in Safari.'
  }
  'lock' {
    Need-Docker
    Set-Env 'INVITE_ONLY' '1'
    docker compose up -d
    Say 'Invite only: new profiles now need an invite code: Settings > Admin dashboard, in the browser.'
  }
  'update' {
    Need-Docker
    Say 'Getting the latest RadiGym'
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { Fail 'git pull did not go through. Copy the message above to Claude.' }
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { Fail 'The build failed. Copy the last lines above to Claude.' }
    Wait-Healthy
    Say 'Updated. Your data is untouched (it lives in the data folder).'
  }
  'status' {
    docker compose ps
    $ts = Tailscale
    & $ts funnel status
  }
  'backup' {
    $stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
    $dest = Join-Path $Root "backups\data-$stamp.zip"
    New-Item -ItemType Directory -Force (Join-Path $Root 'backups') | Out-Null
    Compress-Archive -Path (Join-Path $Root 'data\*') -DestinationPath $dest
    Say "Backup written: $dest"
  }
}
