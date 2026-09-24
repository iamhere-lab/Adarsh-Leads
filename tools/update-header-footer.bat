@echo off
REM Double-click this file to stamp partials\header.html, footer.html and
REM sticky-cta.html into every page. Needs Node.js (already installed if you
REM can run "node -v") or Python.
cd /d "%~dp0\.."
where node >nul 2>nul
if %errorlevel%==0 (
  node "tools\apply-partials.mjs"
  goto done
)
where python >nul 2>nul
if %errorlevel%==0 (
  python "tools\apply-partials.py"
  goto done
)
echo Neither Node.js nor Python was found. Install Node from https://nodejs.org and try again.
:done
echo.
pause
