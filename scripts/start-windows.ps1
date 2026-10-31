# SolarGroup Home – spustenie na Windows. Server počúva iba na tomto počítači (127.0.0.1),
# pokiaľ v backend\.env nenastavíte inak.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\backend"
if (-not (Test-Path ".venv")) { throw "Najprv spustite scripts\setup-windows.bat" }
if (-not (Test-Path "$root\frontend\dist\index.html")) { Write-Host "Upozornenie: frontend nie je zostavený (npm run build)." -ForegroundColor Yellow }
Write-Host "SolarGroup Home: http://127.0.0.1:8080  (Ctrl+C ukončí)" -ForegroundColor Green
& .\.venv\Scripts\python.exe -m app
