#requires -Version 5.1
[CmdletBinding(SupportsShouldProcess=$true)]
param([switch]$KeepCredentials)
$ErrorActionPreference = "Stop"
$installRoot = Join-Path $env:LOCALAPPDATA "HeadroomContextLab"
$appDir = Join-Path $installRoot "app"
$serverPath = Join-Path $appDir "server.mjs"
$shortcutPath = Join-Path ([Environment]::GetFolderPath("Startup")) "Headroom Context Lab Summary.lnk"

# Only stop Node processes running this exact application's installed server.
if (Test-Path $serverPath) {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($serverPath) } |
    ForEach-Object {
      if ($PSCmdlet.ShouldProcess($_.ProcessId, "Stop Headroom helper")) {
        Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
      }
    }
}
if (Test-Path $shortcutPath) {
  $shell=New-Object -ComObject WScript.Shell
  $link=$shell.CreateShortcut($shortcutPath)
  if ($link.Arguments -notlike "*HeadroomContextLab*") {
    throw "Existing startup shortcut is not ours; refusing to remove it."
  }
  if ($PSCmdlet.ShouldProcess($shortcutPath,"Remove Headroom autostart")) {
    Remove-Item -LiteralPath $shortcutPath -Force
  }
}
if (Test-Path $appDir) {
  if ($PSCmdlet.ShouldProcess($appDir,"Remove helper executables")) {
    Remove-Item -LiteralPath $appDir -Recurse -Force
  }
}
if (-not $KeepCredentials -and (Test-Path $installRoot)) {
  if ($PSCmdlet.ShouldProcess($installRoot,"Remove local encrypted credentials and settings")) {
    Remove-Item -LiteralPath $installRoot -Recurse -Force
  }
}
Write-Host "Headroom local helper autostart removed; browser extension is unchanged."
