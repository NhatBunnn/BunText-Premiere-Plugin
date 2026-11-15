@echo off
setlocal
cd /d "%~dp0"

:: Kiem tra quyen Admin
net session >nul 2>&1
if %errorlevel% equ 0 (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0install.ps1\"'"
)
