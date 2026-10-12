#requires -Version 5.1
<#
.SYNOPSIS
Installs the Windows live-game bridge and missing Lovely/Steamodded loaders.
.EXAMPLE
.\scripts\install-mod.ps1 -GameDirectory 'D:\SteamLibrary\steamapps\common\Balatro'
.EXAMPLE
.\scripts\install-mod.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$GameDirectory,
    [string]$ModsDirectory,
    [switch]$UpdateLoaders,
    [string]$LovelyArchive,
    [string]$SteamoddedArchive
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$lovelyVersion = 'v0.10.0'
$steamoddedVersion = '26.1002.0'
$lovelyUrl = "https://github.com/ethangreen-dev/lovely-injector/releases/download/$lovelyVersion/lovely-x86_64-pc-windows-msvc.zip"
$steamoddedUrl = "https://api.github.com/repos/Steamodded/smods/zipball/$steamoddedVersion"

function Find-Balatro {
    $steamRoots = @()
    foreach ($key in @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam')) {
        $item = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
        if ($item) {
            foreach ($property in @('SteamPath', 'InstallPath')) {
                if ($item.PSObject.Properties[$property]) { $steamRoots += $item.$property }
            }
        }
    }
    if (${env:ProgramFiles(x86)}) { $steamRoots += Join-Path ${env:ProgramFiles(x86)} 'Steam' }
    $libraries = @($steamRoots)
    foreach ($steamRoot in $steamRoots | Select-Object -Unique) {
        $libraryFile = Join-Path $steamRoot 'steamapps\libraryfolders.vdf'
        if (Test-Path -LiteralPath $libraryFile -PathType Leaf) {
            $vdf = Get-Content -LiteralPath $libraryFile -Raw
            foreach ($match in [regex]::Matches($vdf, '"path"\s+"([^"]+)"')) {
                $libraries += $match.Groups[1].Value.Replace('\\', '\')
            }
        }
    }
    foreach ($library in $libraries | Select-Object -Unique) {
        $installName = 'Balatro'
        $manifest = Join-Path $library 'steamapps\appmanifest_2379780.acf'
        if (Test-Path -LiteralPath $manifest -PathType Leaf) {
            $match = [regex]::Match((Get-Content -LiteralPath $manifest -Raw), '"installdir"\s+"([^"]+)"')
            if ($match.Success) { $installName = $match.Groups[1].Value }
        }
        $candidate = Join-Path $library "steamapps\common\$installName"
        if (Test-Path -LiteralPath (Join-Path $candidate 'Balatro.exe') -PathType Leaf) { $candidate }
    }
}

function Assert-ChildPath([string]$Path, [string]$Parent) {
    $resolved = [IO.Path]::GetFullPath($Path)
    $prefix = [IO.Path]::GetFullPath($Parent).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path must remain inside ${Parent}: $resolved"
    }
    # Never replace a junction/symlink with a recursive file operation.
    $cursor = $resolved
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked path is unsupported: $cursor" }
        }
        $cursor = Split-Path -Parent $cursor
    }
}

function Expand-Package([string]$Archive, [string]$Url, [string]$Name) {
    if ($Archive) { $zip = (Resolve-Path -LiteralPath $Archive).Path }
    else {
        $zip = Join-Path $stage "$Name.zip"
        Write-Host "Downloading $Name from $Url"
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $Url -OutFile $zip -UseBasicParsing -TimeoutSec 180 -Headers @{ 'User-Agent' = 'Balatro-MCP-Installer' }
    }
    $expanded = Join-Path $stage $Name
    Expand-Archive -LiteralPath $zip -DestinationPath $expanded
    return $expanded
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'This installer supports Windows only.' }
    if (-not $GameDirectory) {
        $candidates = @(Find-Balatro | Select-Object -Unique)
        if ($candidates.Count -eq 1) { $GameDirectory = $candidates[0] }
        elseif ($candidates.Count -gt 1) { throw "Multiple installations found. Use -GameDirectory to select one: $($candidates -join ', ')" }
        else { $GameDirectory = (Read-Host 'Steam folder not found. Enter the folder containing Balatro.exe').Trim('"') }
    }
    $GameDirectory = (Resolve-Path -LiteralPath $GameDirectory).Path
    if (-not (Test-Path -LiteralPath (Join-Path $GameDirectory 'Balatro.exe') -PathType Leaf)) {
        throw 'GameDirectory must contain Balatro.exe. Install the PC game first.'
    }
    if (-not $ModsDirectory) {
        if (-not $env:APPDATA) { throw 'APPDATA is unavailable. Pass -ModsDirectory explicitly.' }
        $ModsDirectory = Join-Path $env:APPDATA 'Balatro\Mods'
    }
    $ModsDirectory = [IO.Path]::GetFullPath($ModsDirectory)
    if ((Split-Path -Leaf $ModsDirectory) -ne 'Mods') { throw 'ModsDirectory must end with a Mods folder.' }
    $profileDirectory = Split-Path -Parent $ModsDirectory
    $source = Join-Path $projectRoot 'play\mod'
    foreach ($file in @('balatro_mcp_mod.json', 'balatro_mcp_mod.lua', 'bridge.lua', 'decision.lua', 'game.lua', 'json.lua', 'scoring.lua', 'transport.lua')) {
        if (-not (Test-Path -LiteralPath (Join-Path $source $file) -PathType Leaf)) { throw "Missing mod source: $file" }
    }
    $existingSteamodded = @()
    if (Test-Path -LiteralPath $ModsDirectory) {
        foreach ($directory in Get-ChildItem -LiteralPath $ModsDirectory -Directory) {
            if ($directory.Name -ne 'balatro_mcp_mod' -and (Test-Path -LiteralPath (Join-Path $directory.FullName 'balatro_mcp_mod.json'))) {
                throw "Duplicate balatro_mcp_mod found: $($directory.FullName)"
            }
            if ((Test-Path -LiteralPath (Join-Path $directory.FullName 'src\preflight\core.lua')) -and
                (Test-Path -LiteralPath (Join-Path $directory.FullName 'version.lua'))) { $existingSteamodded += $directory.FullName }
        }
    }
    if ($existingSteamodded.Count -gt 1) { throw 'Multiple Steamodded copies found in Mods. Keep only one before installation.' }
    $steamoddedTarget = Join-Path $ModsDirectory 'smods'
    if ($existingSteamodded.Count -eq 1) { $steamoddedTarget = $existingSteamodded[0] }
    elseif (Test-Path -LiteralPath $steamoddedTarget) { throw 'Mods\smods exists but is not a recognized Steamodded installation.' }
    $lovelyTarget = Join-Path $GameDirectory 'winmm.dll'
    $legacyLovely = Join-Path $GameDirectory 'version.dll'
    if (-not (Test-Path -LiteralPath $lovelyTarget) -and (Test-Path -LiteralPath $legacyLovely)) {
        $lovelyTarget = $legacyLovely
    }
    $modTarget = Join-Path $ModsDirectory 'balatro_mcp_mod'
    $needLovely = $UpdateLoaders -or -not (Test-Path -LiteralPath $lovelyTarget)
    $needSteamodded = $UpdateLoaders -or $existingSteamodded.Count -eq 0
    if ($UpdateLoaders -and (Test-Path -LiteralPath $legacyLovely)) {
        throw 'Legacy version.dll found. Move it out of the game folder before installing Lovely winmm.dll.'
    }
    foreach ($target in @($lovelyTarget, $modTarget, $steamoddedTarget)) {
        $parent = $ModsDirectory
        if ($target -eq $lovelyTarget) { $parent = $GameDirectory }
        Assert-ChildPath $target $parent
    }
    Write-Host "Game: $GameDirectory"
    Write-Host "Mods: $ModsDirectory"
    Write-Host "Lovely $lovelyVersion install/update: $needLovely; Steamodded $steamoddedVersion install/update: $needSteamodded"
    Write-Host 'Existing loaders are kept unless -UpdateLoaders is supplied. Target game: PC Balatro 1.0.1o.'
    if (-not $PSCmdlet.ShouldProcess("$GameDirectory and $ModsDirectory", 'Back up and install balatro_mcp_mod and required loaders')) { return }
    foreach ($process in Get-Process -Name Balatro -ErrorAction SilentlyContinue) {
        # The game must be closed before replacing its DLL or mod files.
        if (-not $process.Path -or $process.Path -eq (Join-Path $GameDirectory 'Balatro.exe')) {
            throw 'Close Balatro, then run the installer again.'
        }
    }
    $installId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    $stage = Join-Path $projectRoot "build\mod-install\$installId"
    $backup = Join-Path $projectRoot "build\mod-install-backups\$installId"
    Assert-ChildPath $stage $projectRoot
    Assert-ChildPath $backup $projectRoot
    # A backup inside the profile would recurse into itself during profile copying.
    $profilePrefix = $profileDirectory.TrimEnd('\', '/') + '\'
    if ($backup.StartsWith($profilePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Project backup folder must be outside the Balatro profile.' }
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    $replacements = @()
    if ($needLovely) {
        $expanded = Expand-Package $LovelyArchive $lovelyUrl 'lovely'
        $dlls = @(Get-ChildItem -LiteralPath $expanded -Recurse -File -Filter winmm.dll)
        if ($dlls.Count -ne 1) { throw 'Lovely archive must contain exactly one winmm.dll.' }
        $replacements += @{ source = $dlls[0].FullName; target = $lovelyTarget; parent = $GameDirectory }
    }
    if ($needSteamodded) {
        $expanded = Expand-Package $SteamoddedArchive $steamoddedUrl 'steamodded'
        $roots = @(Get-ChildItem -LiteralPath $expanded -Directory | Where-Object {
            (Test-Path -LiteralPath (Join-Path $_.FullName 'version.lua')) -and
            (Test-Path -LiteralPath (Join-Path $_.FullName 'src\preflight\core.lua')) -and
            ((Test-Path -LiteralPath (Join-Path $_.FullName 'lovely.toml')) -or
                (Test-Path -LiteralPath (Join-Path $_.FullName 'lovely') -PathType Container))
        })
        if ($roots.Count -ne 1) { throw 'Steamodded archive must contain one complete source folder.' }
        $replacements += @{ source = $roots[0].FullName; target = $steamoddedTarget; parent = $ModsDirectory }
    }
    $replacements += @{ source = $source; target = $modTarget; parent = $ModsDirectory }
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    if (Test-Path -LiteralPath $profileDirectory) {
        Write-Host 'Backing up the Balatro profile (including saves and existing mods)...'
        Copy-Item -LiteralPath $profileDirectory -Destination (Join-Path $backup 'profile') -Recurse
    }
    New-Item -ItemType Directory -Path $ModsDirectory -Force | Out-Null
    $applied = @()
    try {
        foreach ($replacement in $replacements) {
            Assert-ChildPath $replacement.target $replacement.parent
            $old = Join-Path $backup (Split-Path -Leaf $replacement.target)
            $existed = Test-Path -LiteralPath $replacement.target
            if ($existed) { Move-Item -LiteralPath $replacement.target -Destination $old }
            $applied += @{ target = $replacement.target; parent = $replacement.parent; old = $old; existed = $existed }
            if ($replacement.source) { Copy-Item -LiteralPath $replacement.source -Destination $replacement.target -Recurse }
        }
        $record = [ordered]@{ installedAt = (Get-Date).ToString('o'); gameDirectory = $GameDirectory; modsDirectory = $ModsDirectory;
            lovely = $lovelyVersion; lovelyInstalled = [bool]$needLovely; steamodded = $steamoddedVersion;
            steamoddedInstalled = [bool]$needSteamodded; backup = $backup; replacements = $applied }
        $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backup 'installation.json') -Encoding UTF8
    }
    catch {
        $installError = $_
        for ($index = $applied.Count - 1; $index -ge 0; $index--) {
            $entry = $applied[$index]
            Assert-ChildPath $entry.target $entry.parent
            if (Test-Path -LiteralPath $entry.target) { Remove-Item -LiteralPath $entry.target -Recurse -Force }
            if ($entry.existed) {
                Assert-ChildPath $entry.old $backup
                Move-Item -LiteralPath $entry.old -Destination $entry.target
            }
        }
        throw "Installation failed; replaced files restored. Backup: $backup. $installError"
    }
    Write-Host "Installation complete. Backup: $backup" -ForegroundColor Green
    Write-Host 'Next: launch Balatro through Steam, then run these commands from the project folder:'
    Write-Host '  npm ci'
    Write-Host '  npm run doctor'
    Write-Host '  npm run setup'
    Write-Host 'Merge mcp.local.json into your MCP client configuration (see README.md).'
    Write-Host 'LuaSocket is checked when the live bridge loads.'
}
catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
