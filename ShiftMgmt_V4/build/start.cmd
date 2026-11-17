@echo off
chcp 65001 >nul
start "" wscript.exe "%~dp0START.vbs"
exit /b 0
