# Install script for the prim CLI on Windows
# Usage: irm prim.sh/install.ps1 | iex
# With invite code: & ([scriptblock]::Create((irm prim.sh/install.ps1))) PRIM-XXXXXXXX
$ErrorActionPreference = "Stop"

$InviteCode = if ($args.Count -gt 0) { $args[0] } else { $null }

$BinDir = "$env:USERPROFILE\.prim\bin"
$Bin = "$BinDir\prim.exe"
$BaseUrl = if ($env:PRIM_DOWNLOAD_URL) { $env:PRIM_DOWNLOAD_URL } else { "https://dl.prim.sh/latest" }
$Binary = "prim-windows-x64.exe"

Write-Host "Installing prim (windows-x64)..."

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "prim-install-$([System.Guid]::NewGuid())"
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

try {
    # Download binary + checksums
    Invoke-WebRequest -Uri "$BaseUrl/$Binary" -OutFile "$TmpDir\$Binary" -UseBasicParsing
    Invoke-WebRequest -Uri "$BaseUrl/checksums.sha256" -OutFile "$TmpDir\checksums.sha256" -UseBasicParsing

    # Verify checksum
    $Expected = (Get-Content "$TmpDir\checksums.sha256" | Where-Object { $_ -match $Binary }) -replace "\s+.*$", ""
    if ($Expected) {
        $Actual = (Get-FileHash "$TmpDir\$Binary" -Algorithm SHA256).Hash.ToLower()
        if ($Actual -ne $Expected) {
            Write-Error "Checksum mismatch: expected $Expected, got $Actual"
            exit 1
        }
    }

    # Install binary
    Copy-Item "$TmpDir\$Binary" $Bin -Force
}
finally {
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
}

# Add to PATH via user environment variable
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*\.prim\bin*") {
    [Environment]::SetEnvironmentVariable("Path", "$BinDir;$UserPath", "User")
    Write-Host ""
    Write-Host "Added $BinDir to your PATH."
}

# Also add to current session PATH so chained commands work
if ($env:PATH -notlike "*\.prim\bin*") {
    $env:PATH = "$BinDir;$env:PATH"
}

$Version = try { & $Bin --version 2>$null } catch { "unknown" }
Write-Host ""
Write-Host "prim v$Version installed to $Bin"

if ($InviteCode) {
    Write-Host ""
    Write-Host "Running onboarding with code $InviteCode..."
    & $Bin skill onboard --code $InviteCode
}
else {
    Write-Host ""
    Write-Host "Open a new terminal, then:"
    Write-Host "  prim wallet create"
}
