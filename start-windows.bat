@echo off
cd /d "%~dp0"
echo Starting the EU Classification Engine and Global Alerts at http://localhost:8000
echo Close this window to stop it.
start "" http://localhost:8000
python server.py 2>nul || py server.py
