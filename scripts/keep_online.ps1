<#
Keep the demo reachable on its public link until told to stop.

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\keep_online.ps1 -Url https://<name>.trycloudflare.com -TunnelPid <pid>
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\keep_online.ps1            # start a fresh tunnel

Every 30 seconds it checks, in this order:

* the cloud API on :8100 (which also serves the built web app) - restarted if it stops answering;
* the public link, end to end - if the tunnel process has died, or the link has failed for about
  two minutes while the internet itself is reachable, a new quick tunnel is started.

A quick tunnel cannot be moved between processes, so a replacement always has a **new address**.
The current one is always in .run\public-link.txt, and every event is in .run\keep_online.log.

It also asks Windows not to sleep while it runs (released automatically when it exits). It cannot
stop sleep on lid close or a network that blocks Cloudflare's port 7844 - those are the laptop's
settings and the network's rules.

Stop it with:  Stop-Process -Id (Get-Content .run\keep_online.pid)
#>
param(
    [string]$Url = '',
    [int]$TunnelPid = 0,
    [int]$IntervalSec = 30,
    [int]$FailLimit = 4
)

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path $PSScriptRoot -Parent
$Run = Join-Path $Root '.run'
New-Item -ItemType Directory -Force $Run | Out-Null
$LinkFile = Join-Path $Run 'public-link.txt'
$Log = Join-Path $Run 'keep_online.log'
$Cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$Python = Join-Path $Root '.venv\Scripts\python.exe'
$LocalHealth = 'http://127.0.0.1:8100/api/v1/health'

Set-Content -Path (Join-Path $Run 'keep_online.pid') -Value $PID -Encoding ascii

function Say([string]$msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Add-Content -Path $Log -Encoding utf8 }

function Test-Ok([string]$u) {
    try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 -Uri $u).StatusCode -eq 200 } catch { $false }
}

# ES_CONTINUOUS | ES_SYSTEM_REQUIRED: no idle sleep while this process lives.
Add-Type -Namespace KeepOnline -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
[KeepOnline.Power]::SetThreadExecutionState([uint32]'0x80000001') | Out-Null

function Start-Api {
    Say 'API on :8100 is not answering - starting it'
    Start-Process -FilePath $Python -WorkingDirectory $Root -WindowStyle Hidden `
        -ArgumentList '-m', 'uvicorn', 'sentinel.cloud.api.main:app', '--host', '127.0.0.1', '--port', '8100', '--log-level', 'warning' `
        -RedirectStandardOutput (Join-Path $Run 'api.out.log') -RedirectStandardError (Join-Path $Run 'api.err.log') | Out-Null
}

function Start-Tunnel {
    $tlog = Join-Path $Run 'tunnel.log'
    Remove-Item $tlog -ErrorAction SilentlyContinue
    # No --protocol: the default tries QUIC (UDP 7844) and falls back to HTTP/2, which is what works on
    # networks that block one of them.
    $p = Start-Process -FilePath $Cloudflared -WindowStyle Hidden -PassThru `
        -ArgumentList 'tunnel', '--no-autoupdate', '--logfile', "`"$tlog`"", '--url', 'http://127.0.0.1:8100'
    $u = ''
    for ($i = 0; $i -lt 60 -and -not $u; $i++) {
        Start-Sleep -Seconds 2
        $m = Select-String -Path $tlog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($m) { $u = $m.Matches[0].Value }
    }
    if (-not $u) { Say "tunnel (pid $($p.Id)) started but announced no address yet" }
    return @{ Pid = $p.Id; Url = $u }
}

function Publish([string]$u) {
    Set-Content -Path $LinkFile -Value $u -Encoding ascii
    Say "PUBLIC LINK: $u"
}

if ($Url -and $TunnelPid) {
    Say "adopting tunnel pid $TunnelPid at $Url"
    Publish $Url
} else {
    $t = Start-Tunnel; $TunnelPid = $t.Pid; $Url = $t.Url
    if ($Url) { Publish $Url }
}

$apiFails = 0
$linkFails = 0
while ($true) {
    if (Test-Ok $LocalHealth) {
        $apiFails = 0
    } else {
        $apiFails++
        Say "API check failed ($apiFails)"
        if ($apiFails -ge 2) { Start-Api; $apiFails = 0; Start-Sleep -Seconds 20 }
    }

    $alive = $TunnelPid -and (Get-Process -Id $TunnelPid -ErrorAction SilentlyContinue)
    if ($alive -and $Url -and (Test-Ok "$Url/api/v1/health")) {
        if ($linkFails -gt 0) { Say "link is back: $Url" }
        $linkFails = 0
    } else {
        $linkFails++
        Say "link check failed ($linkFails/$FailLimit), tunnel process alive: $([bool]$alive)"
    }

    # Replace the tunnel only when the internet is up - otherwise a new one would fail the same way.
    if ((-not $alive -or $linkFails -ge $FailLimit) -and (Test-Ok 'https://www.cloudflare.com/cdn-cgi/trace')) {
        if ($alive) { Stop-Process -Id $TunnelPid -Force -ErrorAction SilentlyContinue }
        Say 'starting a replacement tunnel (the address will change)'
        $t = Start-Tunnel; $TunnelPid = $t.Pid; $Url = $t.Url
        if ($Url) { Publish $Url }
        $linkFails = 0
    }

    Start-Sleep -Seconds $IntervalSec
}
