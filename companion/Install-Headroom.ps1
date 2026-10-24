#requires -Version 5.1
<#
  Per-user, one-click installation of Headroom Context Lab's localhost companion.
  No administrator rights, proxy changes, desktop files or third-party download.
#>
[CmdletBinding(SupportsShouldProcess=$true)]
param([switch]$DryRun, [switch]$NoStart, [string]$ExtensionId)
$ErrorActionPreference = "Stop"
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$installRoot = Join-Path $env:LOCALAPPDATA "HeadroomContextLab"
$appDir = Join-Path $installRoot "app"
$serverPath = Join-Path $appDir "server.mjs"
$settingsPath = Join-Path $installRoot "local-config.json"
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "Headroom Context Lab Summary.lnk"
$launcherPath = Join-Path $appDir "Launch-Hidden.vbs"
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source

function Find-ExtensionId {
  $chromeRoot = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
  if (-not (Test-Path $chromeRoot)) { return $null }
  $foundIds = New-Object System.Collections.Generic.List[string]
  $profiles = @(Get-ChildItem -LiteralPath $chromeRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq "Default" -or $_.Name -like "Profile *" })
  foreach ($profile in $profiles) {
    foreach ($filename in @("Preferences", "Secure Preferences")) {
      $file = Join-Path $profile.FullName $filename
      if (-not (Test-Path $file)) { continue }
      try {
        $prefs = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8) | ConvertFrom-Json
        if (-not $prefs.extensions -or -not $prefs.extensions.settings) { continue }
        foreach ($entry in $prefs.extensions.settings.PSObject.Properties) {
          $data = $entry.Value
          $name = [string]$data.manifest.name
          $loc = [string]$data.path
          if (($name -eq "Headroom Context Lab" -or $name -eq "Headroom Context Lab (Local Test)" -or
                ($loc -like "*ChatGPT-Context-Monitor*" -and $name -like "*Headroom*")) -and
              $entry.Name -match "^[a-p]{32}$") {
            $foundIds.Add($entry.Name)
          }
        }
      } catch {
        # Chrome may be updating Preferences, so fall back to manual ID entry.
      }
    }
  }
  $unique = @($foundIds | Select-Object -Unique)
  if ($unique.Count -eq 1) { return $unique[0] }
  return $null
}

if (!(Test-Path (Join-Path $sourceRoot "server.mjs"))) { throw "Companion files are missing. Extract the entire ZIP first." }
if (!(Test-Path (Join-Path $sourceRoot "setup.mjs"))) { throw "Missing setup.mjs." }
if ([string]::IsNullOrWhiteSpace($startupDir)) { throw "Current user's Startup folder not available." }
try {
  $ver = (& $nodeExe --version)
  Write-Host ("Node.js: " + $ver)
} catch { throw "Node.js installation could not be run." }

# Prefer the already explicitly saved identity; only try automatic discovery on first install.
if (-not $ExtensionId -and (Test-Path $settingsPath)) {
  try {
    $config = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([string]$config.extensionId -match "^[a-p]{32}$") { $ExtensionId = [string]$config.extensionId }
  } catch {}
}
if (-not $ExtensionId) { $ExtensionId = Find-ExtensionId }
if (-not $ExtensionId -and -not $DryRun) {
  Write-Host "Cannot automatically locate the Chrome extension ID."
  Write-Host "Open chrome://extensions, find Headroom Context Lab, and copy its ID once."
  $ExtensionId = Read-Host "Chrome extension ID (32 lowercase letters a-p)"
}
if ($ExtensionId -and $ExtensionId -notmatch "^[a-p]{32}$") { throw "Invalid extension ID." }
if ($DryRun) {
  Write-Host "DRY RUN: install folder = $appDir"
  Write-Host "DRY RUN: autostart shortcut = $shortcutPath"
  Write-Host "DRY RUN: Node executable = $nodeExe"
  Write-Host ("DRY RUN: extension ID = " + $(if($ExtensionId){$ExtensionId}else{"will be requested on first install"}))
  return
}
if (-not $ExtensionId) { throw "An extension ID is required." }
if (-not $PSCmdlet.ShouldProcess($installRoot,"Install Headroom helper and enable current-user login startup")) { return }

# Stop only the *previously installed copy* of this service, never other Node apps.
if (Test-Path $serverPath) {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($serverPath) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
}
New-Item -ItemType Directory -Path $appDir -Force | Out-Null
Get-ChildItem -LiteralPath $sourceRoot -Filter "*.mjs" -File | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $appDir $_.Name) -Force
}
Copy-Item -LiteralPath (Join-Path $sourceRoot "README.md") -Destination (Join-Path $appDir "README.md") -Force

# Keep the actual companion ID registered securely with the existing app setup.
& $nodeExe (Join-Path $appDir "setup.mjs") $ExtensionId
if ($LASTEXITCODE -ne 0) { throw "Extension ID configuration failed." }

# WScript launches a hidden Node process. It checks the command line first to
# avoid spawning a duplicate service at every login or double-click.
$nodeVbs = $nodeExe.Replace('"', '""')
$serverVbs = $serverPath.Replace('"', '""')
$vbs = @"
Option Explicit
Dim sh, wmi, procs, p, cmd
Set sh = CreateObject("WScript.Shell")
On Error Resume Next
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
If Err.Number = 0 Then
  Set procs = wmi.ExecQuery("SELECT CommandLine FROM Win32_Process WHERE Name='node.exe'")
  For Each p In procs
    cmd = ""
    If Not IsNull(p.CommandLine) Then cmd = CStr(p.CommandLine)
    If InStr(1, cmd, "$serverVbs", 1) > 0 Then WScript.Quit 0
  Next
End If
On Error GoTo 0
sh.Run Chr(34) & "$nodeVbs" & Chr(34) & " " & Chr(34) & "$serverVbs" & Chr(34), 0, False
"@
[IO.File]::WriteAllText($launcherPath, $vbs, [Text.Encoding]::Unicode)
$wscript = Join-Path $env:WINDIR "System32\wscript.exe"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $wscript
$shortcut.Arguments = '//B //Nologo "' + $launcherPath + '"'
$shortcut.WorkingDirectory = $appDir
$shortcut.Description = "Headroom Context Lab background summary helper"
$shortcut.Save()
Write-Host "Autostart registered for the current Windows user."

if (-not $NoStart) {
  & $wscript //B //Nologo $launcherPath
  $probe = "http://127.0.0.1:18763/status"
  $headers = @{ Origin = "chrome-extension://$ExtensionId"; "X-Headroom-Extension" = $ExtensionId }
  $ok = $false
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $resp = Invoke-RestMethod -Method GET -Uri $probe -Headers $headers -TimeoutSec 3
      if ($resp.ok) { $ok = $true; break }
    } catch {}
  }
  if ($ok) { Write-Host "Local helper connected successfully." }
  else { Write-Warning "The helper has been installed but local HTTP health-check did not succeed. Check that port 18763 is free." }
}
Write-Host "Installation finished. In Chrome, reload the Headroom Context Lab extension and click 'Check local service'."
