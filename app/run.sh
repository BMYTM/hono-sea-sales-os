#!/usr/bin/env bash
# HONO Sales OS — private launcher (macOS / Linux)
set -e
cd "$(dirname "$0")"
[ -f config.env ] && set -a && source config.env && set +a
export HONO_TEMPLATE="${HONO_TEMPLATE:-$HONO_PROJECT_DIR/HONO_HCM Proposal_01072026_SIM_FullHRMSSuite.docx}"

if [ ! -d .venv ]; then
  echo "First run — setting up…"
  python3 -m venv .venv
  ./.venv/bin/pip install -q --upgrade pip
  ./.venv/bin/pip install -q -r requirements.txt
fi

PORT="${HONO_PORT:-8765}"
echo "Opening http://127.0.0.1:$PORT ..."
( sleep 1.5; (command -v open >/dev/null && open "http://127.0.0.1:$PORT") || true ) &
exec ./.venv/bin/python app.py
