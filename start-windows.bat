@echo off
cd /d "%~dp0"
echo Starting the EU Classification Engine at http://localhost:8000
echo Close this window to stop it.
start "" http://localhost:8000
python -m http.server 8000 2>nul || py -m http.server 8000
