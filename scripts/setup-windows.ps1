# SolarGroup Home – prvotná inštalácia na Windows (iba lokálne, nič sa nenasadzuje).
# Spustenie: pravý klik > "Run with PowerShell", alebo scripts\setup-windows.bat
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== Kontrola nástrojov ==" -ForegroundColor Cyan
$py = Get-Command py -ErrorAction SilentlyContinue
if ($py) { $python = "py"; $pyArgs = @("-3") } else { $python = "python"; $pyArgs = @() }
& $python @pyArgs --version
if ($LASTEXITCODE -ne 0) { throw "Python 3.11+ nie je nainštalovaný (https://www.python.org/downloads/)." }
node --version
if ($LASTEXITCODE -ne 0) { throw "Node.js 22 LTS nie je nainštalovaný (https://nodejs.org/)." }

Write-Host "== Backend: virtuálne prostredie a balíčky ==" -ForegroundColor Cyan
Set-Location "$root\backend"
if (-not (Test-Path ".venv")) { & $python @pyArgs -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install --upgrade pip | Out-Null
& .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Vytvorený backend\.env (režim DEMO). Upravte podľa potreby." -ForegroundColor Yellow
}

Write-Host "== Frontend: balíčky a zostavenie ==" -ForegroundColor Cyan
Set-Location "$root\frontend"
npm ci
npm run build

Write-Host ""
Write-Host "Hotovo. Spustite scripts\start-windows.bat a otvorte http://127.0.0.1:8080" -ForegroundColor Green
