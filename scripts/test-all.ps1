#!/usr/bin/env pwsh
# MediSync - Unified Test Runner

param(
    [switch]$Verbose,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$results = @()

function Test-Module {
    param($Name, $Path, $BuildCmd, $TestCmd)
    
    Write-Host "`n🧪 Testing $Name..." -ForegroundColor Cyan
    Push-Location $Path
    
    try {
        # Build
        if (-not $SkipBuild) {
            Write-Host "  Building..." -ForegroundColor Gray
            $buildOutput = Invoke-Expression $BuildCmd 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "Build failed"
            }
        }
        
        # TypeScript Check
        Write-Host "  TypeScript check..." -ForegroundColor Gray
        $tsOutput = npx tsc --noEmit 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "TypeScript errors found"
        }
        
        # Test
        if ($TestCmd) {
            Write-Host "  Running tests..." -ForegroundColor Gray
            $testOutput = Invoke-Expression $TestCmd 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "Tests failed"
            }
        }
        
        $results += @{ Module = $Name; Status = "✅ PASS"; Error = $null }
        Write-Host "  ✅ $Name passed" -ForegroundColor Green
    }
    catch {
        $results += @{ Module = $Name; Status = "❌ FAIL"; Error = $_ }
        Write-Host "  ❌ $Name failed: $_" -ForegroundColor Red
    }
    finally {
        Pop-Location
    }
}

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║    MediSync Test Suite Runner       ║" -ForegroundColor Blue
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Blue

# Test Backend
Test-Module -Name "Backend" -Path "backend" -BuildCmd "npm run build" -TestCmd "npm test"

# Test Discord Bot
Test-Module -Name "Discord Bot" -Path "bot/discord" -BuildCmd "npm run build" -TestCmd $null

# Test Dashboard
Test-Module -Name "Dashboard" -Path "dashboard" -BuildCmd "npm run build" -TestCmd $null

# Summary
Write-Host "`n╔══════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║           Test Summary               ║" -ForegroundColor Blue
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Blue

$passed = ($results | Where-Object { $_.Status -eq "✅ PASS" }).Count
$failed = ($results | Where-Object { $_.Status -eq "❌ FAIL" }).Count

foreach ($r in $results) {
    Write-Host "$($r.Status) $($r.Module)" -ForegroundColor $(if ($r.Status -eq "✅ PASS") { "Green" } else { "Red" })
}

Write-Host "`nTotal: $($results.Count) | Passed: $passed | Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })

exit $failed
