[CmdletBinding()]
param(
    [string]$Version = "2.7.0"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$releaseRoot = Join-Path $projectRoot "release"
$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) "fangcun-release-$Version-$([Guid]::NewGuid().ToString('N'))"
$archive = Join-Path $releaseRoot "fangcun-release-$Version.tar.gz"

$rootFiles = @(
    ".env.example", "README.md", "package.json", "index.html", "styles.css", "v22-layout.css",
    "smart-parser.js", "docx-schedule-parser.js", "app.js", "manifest.webmanifest", "icon.svg",
    "service-worker.js", "server.js", "outlook-sync.js", "google-sync.js", "reset-password.js", "smart-parser-smoke.js",
    "docx-schedule-smoke.js", "outlook-sync-smoke.js", "google-sync-smoke.js", "smoke-test.js", "runtime-smoke.js",
    "mobile-smoke.js", "v22-smoke.js", "android-smoke.js", "release-smoke.js", "password-reset-smoke.js", "server-smoke.js"
)

try {
    New-Item -ItemType Directory -Force -Path $releaseRoot, $stageRoot | Out-Null
    foreach ($file in $rootFiles) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $stageRoot $file)
    }
    foreach ($directory in @("android", "deploy", "docs")) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination (Join-Path $stageRoot $directory) -Recurse
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $stageRoot "imports\examples") | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot "imports\README.md") -Destination (Join-Path $stageRoot "imports\README.md")
    Copy-Item -LiteralPath (Join-Path $projectRoot "imports\examples\fictional-university-timetable-sample.json") -Destination (Join-Path $stageRoot "imports\examples\fictional-university-timetable-sample.json")

    foreach ($generatedPath in @(
        (Join-Path $stageRoot "android\.gradle"),
        (Join-Path $stageRoot "android\app\build"),
        (Join-Path $stageRoot "android\build"),
        (Join-Path $stageRoot "android\local.properties")
    )) {
        if (Test-Path -LiteralPath $generatedPath) {
            Remove-Item -LiteralPath $generatedPath -Recurse -Force
        }
    }

    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    & tar -czf $archive -C $stageRoot .
    if ($LASTEXITCODE -ne 0) { throw "Release archive creation failed." }
    Write-Host "Release archive: $archive"
    Get-FileHash -LiteralPath $archive -Algorithm SHA256 | Format-List
} finally {
    if (Test-Path -LiteralPath $stageRoot) {
        Remove-Item -LiteralPath $stageRoot -Recurse -Force
    }
}
