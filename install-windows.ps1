<#
.SYNOPSIS
  Install / uninstall the dsh-peak-hours plugin into a DeepSeek Harness profile.

.DESCRIPTION
  Copies this folder into <DSH_HOME>/profiles/<Profile>/node_modules/dsh-peak-hours
  and adds an idempotent insert block to that profile's cordis.patch.yml.
  Works on Windows PowerShell 5.1 and PowerShell 7+. No admin rights required.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-windows.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 -Profile web -Uninstall
#>
[CmdletBinding()]
param(
  [string]$Profile = 'desktop',
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$PluginName = 'dsh-peak-hours'
$MarkerStart = '# >>> dsh-peak-hours >>>'
$MarkerEnd = '# <<< dsh-peak-hours <<<'

$homeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $homeDir '.dsh' }
$profileDir = Join-Path (Join-Path $dshHome 'profiles') $Profile
$patchFile = Join-Path $profileDir 'cordis.patch.yml'
$destDir = Join-Path (Join-Path $profileDir 'node_modules') $PluginName

if (-not (Test-Path -LiteralPath $profileDir)) {
  throw "Profile not found: $profileDir. Pass -Profile <name> (the desktop app uses 'desktop')."
}

function Remove-Block([string]$text) {
  $pattern = "(?s)\r?\n?" + [regex]::Escape($MarkerStart) + ".*?" + [regex]::Escape($MarkerEnd) + "\r?\n?"
  return [regex]::Replace($text, $pattern, "`n")
}

if ($Uninstall) {
  if (Test-Path -LiteralPath $destDir) {
    Remove-Item -LiteralPath $destDir -Recurse -Force
    Write-Host "Removed $destDir"
  }
  if (Test-Path -LiteralPath $patchFile) {
    $text = Get-Content -LiteralPath $patchFile -Raw
    if ($text -like "*$MarkerStart*") {
      Set-Content -LiteralPath $patchFile -Value (Remove-Block $text) -Encoding UTF8 -NoNewline
      Write-Host "Removed the $PluginName block from cordis.patch.yml"
    }
  }
  Write-Host ''
  Write-Host 'Done. Restart DeepSeek Harness (quit fully, then relaunch) to finish unloading.' -ForegroundColor Yellow
  return
}

# --- install -------------------------------------------------------------
if (-not (Test-Path -LiteralPath $PSScriptRoot)) { throw 'Cannot locate the plugin folder.' }

$source = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$destFull = [System.IO.Path]::GetFullPath($destDir)
if ($source.TrimEnd('\') -ieq $destFull.TrimEnd('\')) {
  throw 'Source and destination are the same folder; run the script from the plugin folder outside the profile.'
}

if (Test-Path -LiteralPath $destDir) { Remove-Item -LiteralPath $destDir -Recurse -Force }
New-Item -ItemType Directory -Path $destDir -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $destDir -Recurse -Force
Write-Host "Copied plugin to $destDir"

if (-not (Test-Path -LiteralPath $patchFile)) {
  New-Item -ItemType File -Path $patchFile -Force | Out-Null
  Set-Content -LiteralPath $patchFile -Value "[]`n" -Encoding UTF8
}

$text = Get-Content -LiteralPath $patchFile -Raw
if ($text -like "*$PluginName*") {
  Write-Host "cordis.patch.yml already mentions $PluginName - leaving it untouched."
} else {
  $block = @()
  $block += ''
  $block += $MarkerStart
  $block += '- insert:'
  $block += '    - id: dsh-peak-hours'
  $block += '      name: dsh-peak-hours'
  $block += $MarkerEnd

  $text = $text.TrimEnd() + "`n" + ($block -join "`n") + "`n"
  Set-Content -LiteralPath $patchFile -Value $text -Encoding UTF8 -NoNewline
  Write-Host "Added the $PluginName row to $patchFile"
}

Write-Host ''
Write-Host 'Installed. Restart DeepSeek Harness (quit fully, then relaunch).' -ForegroundColor Green
Write-Host "Then open <your DSH web URL>/plugins/$PluginName/client.js" -ForegroundColor DarkGray
