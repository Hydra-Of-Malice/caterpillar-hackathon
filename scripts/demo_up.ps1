# Start the full CAT Sentinel stack locally (Windows PowerShell).
#   powershell -ExecutionPolicy Bypass -File scripts\demo_up.ps1 [-Scenario ravi_shift1] [-Speed 1] [-Train]
param(
    [string]$Scenario = "demo_short",
    [double]$Speed = 1,
    [switch]$Train
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$py = Join-Path $root ".venv\Scripts\python.exe"

# 1. Broker: Mosquitto in Docker, else the pure-Python fallback
$broker = $null
docker compose up -d broker 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker unavailable - starting amqtt fallback broker"
    $broker = Start-Process $py -ArgumentList "-m", "sentinel.bus.broker" -PassThru -WindowStyle Minimized
    Start-Sleep -Seconds 2
}

# 2. Seed demo world (+ optionally train models)
& $py -m sentinel.seed
if ($Train) { & $py -m ml.train_all }

# 3. Services (each in its own window so they can be killed independently in the demo)
$procs = @()
$procs += Start-Process $py -ArgumentList "-m", "sentinel.safety.main" -PassThru
$procs += Start-Process $py -ArgumentList "-m", "uvicorn", "sentinel.cloud.api.main:app", "--port", "8100" -PassThru
$procs += Start-Process $py -ArgumentList "-m", "uvicorn", "sentinel.edge_api.main:app", "--port", "8000" -PassThru
Start-Sleep -Seconds 3
$procs += Start-Process $py -ArgumentList "-m", "sentinel.sim.run", "--scenario", $Scenario, "--speed", $Speed -PassThru
$procs += Start-Process "npm" -ArgumentList "run", "dev" -WorkingDirectory (Join-Path $root "web") -PassThru

Write-Host "`nCAT Sentinel running:"
Write-Host "  UI          http://localhost:5173"
Write-Host "  Edge API    http://127.0.0.1:8000/docs"
Write-Host "  Cloud API   http://127.0.0.1:8100/docs"
Write-Host "Press Enter to stop everything."
[void][Console]::ReadLine()
$procs + @($broker) | Where-Object { $_ } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
