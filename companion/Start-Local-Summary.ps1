$ErrorActionPreference = 'Stop'
$root = Split-Path $MyInvocation.MyCommand.Path -Parent
$config = Join-Path $env:LOCALAPPDATA 'HeadroomContextLab\local-config.json'
if (!(Test-Path $config)) {
  Write-Host 'First setup: find your Headroom Context Lab extension ID at chrome://extensions'
  $id = Read-Host 'Paste the 32-character Chrome extension ID'
  & node (Join-Path $root 'setup.mjs') $id
  if ($LASTEXITCODE -ne 0) { throw 'Setup failed' }
}
Write-Host 'Keep this window open while using automatic summarization.'
& node (Join-Path $root 'server.mjs')
