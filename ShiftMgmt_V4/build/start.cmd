@echo off
chcp 65001 >nul
"%~dp0runtime\node.exe" "%~dp0scripts\start-installed.mjs"
set "START_RESULT=%ERRORLEVEL%"
if not "%START_RESULT%"=="0" pause
exit /b %START_RESULT%
