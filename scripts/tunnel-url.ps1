param(
  [string]$Container = "",
  [int]$MaxWaitSeconds = 90,
  [switch]$Apply,
  [string[]]$EnvFiles = @("apps/api/.env", ".env")
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

if (-not $Container) {
  $Container = docker compose --profile tunnel ps -q cloudflared 2>$null | Select-Object -First 1
  if (-not $Container) {
    $Container = "naori-cloudflared-1"
  }
}

Write-Host "Aguardando URL do túnel (até ${MaxWaitSeconds}s)..."

$url = $null
$deadline = (Get-Date).AddSeconds($MaxWaitSeconds)
while ((Get-Date) -lt $deadline) {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $logs = docker logs $Container 2>&1 | Out-String
  $ErrorActionPreference = $prevEap
  if ($logs -match '(https://[a-z0-9-]+\.trycloudflare\.com)') {
    $url = $Matches[1]
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $url) {
  Write-Error "URL do túnel não encontrada. Rode: docker compose --profile tunnel logs cloudflared"
}

Write-Host ""
Write-Host "URL pública do túnel:" -ForegroundColor Green
Write-Host $url
Write-Host ""

function Write-EnvFileLines {
  param([string]$Path, [string[]]$Lines)
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllLines($Path, $Lines, $utf8NoBom)
}

if ($Apply) {
  foreach ($EnvFile in $EnvFiles) {
    $envPath = Join-Path $root $EnvFile
    if (-not (Test-Path $envPath)) { continue }

    $lines = Get-Content $envPath
    $updated = $false
    $updatedTunnel = $false
    $newLines = foreach ($line in $lines) {
      if ($line -match '^WHATSAPP_API_URL=') {
        $updated = $true
        "WHATSAPP_API_URL=http://localhost:8085"
      } elseif ($line -match '^WHATSAPP_TUNNEL_URL=') {
        $updatedTunnel = $true
        "WHATSAPP_TUNNEL_URL=$url"
      } else {
        $line
      }
    }

    if (-not $updated) {
      $newLines += "WHATSAPP_API_URL=http://localhost:8085"
    }
    if (-not $updatedTunnel) {
      $newLines += "WHATSAPP_TUNNEL_URL=$url"
    }

    Write-EnvFileLines -Path $envPath -Lines $newLines
    Write-Host "Atualizado WHATSAPP_API_URL em $EnvFile" -ForegroundColor Cyan
  }

  Write-Host "Recriando evolution-api com a nova URL pública..." -ForegroundColor Yellow
  docker compose --profile tunnel up -d evolution-api | Out-Null

  Write-Host ""
  Write-Host "Pronto! Reinicie a API: bun run dev" -ForegroundColor Green
} else {
  Write-Host "Copie para apps/api/.env:" -ForegroundColor Cyan
  Write-Host "WHATSAPP_API_URL=$url"
  Write-Host ""
  Write-Host "Ou aplique automaticamente:" -ForegroundColor Cyan
  Write-Host "  .\scripts\tunnel-url.ps1 -Apply"
}
