# Windows equivalent of "make dev" — build and run Relay Chat on :8080
# Requires: Go, Bun (https://bun.sh)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Ensure Go and Bun are on PATH if installed in default locations
$goBin = "C:\Program Files\Go\bin"
$bunBin = "$env:USERPROFILE\.bun\bin"
foreach ($d in @($goBin, $bunBin)) {
    if (Test-Path $d) { $env:Path = "$d;$env:Path" }
}

$version = "dev"
$commit = try { git rev-parse --short HEAD 2>$null } catch { "unknown" }
$buildTime = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
$ldflags = "-X main.version=$version -X main.commit=$commit -X main.buildTime=$buildTime"

Write-Host "--- Building frontend ---"
Push-Location frontend
bun install
bun run build
Pop-Location

Write-Host "--- Copying static assets ---"
$staticDir = "cmd/app/static"
if (Test-Path $staticDir) { Remove-Item "$staticDir/*" -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staticDir | Out-Null
Copy-Item -Path "frontend/dist/*" -Destination $staticDir -Recurse -Force

Write-Host "--- Building Go binary ---"
go build -ldflags "$ldflags" -o relay-chat.exe ./cmd/app/

if (-not (Test-Path tmp)) { New-Item -ItemType Directory -Path tmp | Out-Null }

Write-Host "--- Starting relay-chat on http://localhost:8080 ---"
Write-Host "    DB: ./tmp/app.db (persists between restarts)"
Write-Host "    DEV_MODE: admin/admin user auto-created if no users exist"
Write-Host "    Ctrl+C to stop"
$env:PORT = "8080"
$env:DEV_MODE = "true"
$env:DATA_DIR = "./tmp"
& ./relay-chat.exe serve
