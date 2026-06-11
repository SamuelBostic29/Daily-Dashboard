# Removes the gmc-review:// URL scheme registered by install-protocol.ps1.
# The D:\gmc-reviews\ cache is left alone - clear it with cleanup-reviews.ps1 -Days 0.
$ErrorActionPreference = 'Stop'

$key = "HKCU:\Software\Classes\gmc-review"

if (-not (Test-Path $key)) {
    Write-Host "gmc-review:// is not registered - nothing to remove."
    return
}

Remove-Item -Path $key -Recurse -Force
Write-Host "Unregistered gmc-review://"
