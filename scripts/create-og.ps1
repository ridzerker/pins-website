# Export all branding from the Pins vector master, then sync this website.
$appPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'Pins'
node (Join-Path $appPath 'scripts/export-brand.cjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node (Join-Path $appPath 'scripts/sync-website-brand.cjs')
exit $LASTEXITCODE
