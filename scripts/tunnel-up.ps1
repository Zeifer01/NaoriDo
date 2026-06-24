param(
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "Subindo Evolution API + Cloudflare Tunnel..." -ForegroundColor Cyan
docker compose --profile tunnel up -d evolution-api cloudflared

& (Join-Path $root "scripts\tunnel-url.ps1") -Apply:$Apply
