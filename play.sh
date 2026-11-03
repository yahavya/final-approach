#!/bin/sh
# Starts the game on a local web server and opens it in Chrome.
cd "$(dirname "$0")" || exit 1
PORT=8127
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
  nohup python3 tools/serve.py "$PORT" >/dev/null 2>&1 &
  sleep 1
fi
open -a "Google Chrome" "http://127.0.0.1:$PORT/"
