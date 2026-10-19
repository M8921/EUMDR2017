#!/bin/sh
cd "$(dirname "$0")"
echo "Starting the EU Classification Engine at http://localhost:8000 (Ctrl+C to stop)"
( sleep 1; open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000 2>/dev/null ) &
python3 -m http.server 8000
