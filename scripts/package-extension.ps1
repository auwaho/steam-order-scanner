[CmdletBinding()]
param([string] $Destination)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$extensionRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot 'SORS')).Path
if (!$Destination) {
    $Destination = Join-Path $projectRoot 'SORS.zip'
}
$archivePath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Destination)
if (Test-Path -LiteralPath $archivePath -PathType Container) {
    throw 'Choose an archive file, not a directory.'
}
$extensionBoundary = $extensionRoot + [IO.Path]::DirectorySeparatorChar
if ($archivePath.StartsWith($extensionBoundary, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Choose an archive path outside the extension directory.'
}

$manifest = Get-Content -Raw -LiteralPath (Join-Path $extensionRoot 'manifest.json') | ConvertFrom-Json
$manifestFiles = @(
    'manifest.json'
    $manifest.icons.PSObject.Properties.Value
    $manifest.action.default_popup
    $manifest.background.service_worker
    foreach ($script in $manifest.content_scripts) {
        $script.js
        $script.css
    }
    foreach ($bundle in $manifest.web_accessible_resources) {
        $bundle.resources
    }
) | Where-Object { $_ } | Sort-Object -Unique
foreach ($relativePath in $manifestFiles) {
    if (!(Test-Path -LiteralPath (Join-Path $extensionRoot $relativePath) -PathType Leaf)) {
        throw "Missing extension file: $relativePath"
    }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archiveDirectory = Split-Path -Parent $archivePath
$stagingPath = Join-Path $archiveDirectory ('.sors-' + [Guid]::NewGuid().ToString('N') + '.zip')
try {
    $building = [IO.Compression.ZipFile]::Open($stagingPath, 'Create')
    try {
        $sourceFiles = Get-ChildItem -LiteralPath $extensionRoot -Recurse -File | Sort-Object FullName
        foreach ($file in $sourceFiles) {
            $entry = $file.FullName.Substring($extensionBoundary.Length).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($building, $file.FullName, $entry, 'Optimal') | Out-Null
        }
    } finally {
        $building.Dispose()
    }
    $archive = [IO.Compression.ZipFile]::OpenRead($stagingPath)
    try {
        $entries = $archive.Entries.FullName
        foreach ($relativePath in $manifestFiles) {
            $entry = $relativePath.Replace('\', '/')
            if ($entry -cnotin $entries) {
                throw "Missing archive entry: $entry"
            }
        }
    } finally {
        $archive.Dispose()
    }

    Move-Item -LiteralPath $stagingPath -Destination $archivePath -Force
    Write-Output "Built $archivePath"
} finally {
    if (Test-Path -LiteralPath $stagingPath -PathType Leaf) {
        Remove-Item -LiteralPath $stagingPath
    }
}
