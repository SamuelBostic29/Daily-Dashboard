# Removes the gmc-review:// and gmc-refresh:// URL schemes registered by install-protocol.ps1.
# The reviews cache (reviewsRoot in config/dashboard.json) is left alone - clear it with cleanup-reviews.ps1 -Days 0.
$ErrorActionPreference = 'Stop'

foreach ($scheme in 'gmc-review', 'gmc-refresh') {
    $key = "HKCU:\Software\Classes\$scheme"
    if (-not (Test-Path $key)) {
        Write-Host "${scheme}:// is not registered - nothing to remove."
        continue
    }
    Remove-Item -Path $key -Recurse -Force
    Write-Host "Unregistered ${scheme}://"
}
