# BunText Installer for Premiere Pro
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$source = $PSScriptRoot
$targets = @(
    "C:\Program Files\Common Files\Adobe\UXP\extensions\BunText",
    "C:\Program Files\Common Files\Adobe\UXP\Plugins\External\com.buntext.premiere.plugin_1.0.0",
    "$env:APPDATA\Adobe\UXP\Plugins\External\com.buntext.premiere.plugin_1.0.0",
    "$env:APPDATA\Adobe\UXP\extensions\BunText"
)

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "       CAI DAT BUNTEXT CHO ADOBE PREMIERE PRO            " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

foreach ($target in $targets) {
    try {
        if (-not (Test-Path $target)) {
            New-Item -ItemType Directory -Path $target -Force | Out-Null
        }

        Copy-Item -Path "$source\manifest.json" -Destination "$target\manifest.json" -Force
        Copy-Item -Path "$source\index.html" -Destination "$target\index.html" -Force
        Copy-Item -Path "$source\styles.css" -Destination "$target\styles.css" -Force
        Copy-Item -Path "$source\index.js" -Destination "$target\index.js" -Force
        Copy-Item -Path "$source\jszip.min.js" -Destination "$target\jszip.min.js" -Force
        Copy-Item -Path "$source\assets" -Destination "$target" -Recurse -Force
        Copy-Item -Path "$source\icons" -Destination "$target" -Recurse -Force

        Write-Host "[OK] Da sao chep toi: $target" -ForegroundColor Green
    } catch {
        Write-Host "[BO QUA] Khong the ghi toi: $target ($($_.Exception.Message))" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "HOAN TAT CAI DAT! Vui long lam theo 2 buoc sau:" -ForegroundColor White
Write-Host "1. TAT Premiere Pro di (neu dang bat) roi KHOI DONG LAI." -ForegroundColor White
Write-Host "2. Nhin anh huong dan cua toi: Vao Window -> UXP Plugins -> BunText" -ForegroundColor Yellow
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Nhan phim bat ky de dong cua so nay..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
