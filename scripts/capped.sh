#!/usr/bin/env bash
# Runs a command, and everything it starts, under a hard memory cap: a runaway headless browser is killed
# alone instead of taking the whole server down (global OOM and a forced reboot on 2026-11-23).
#   scripts/capped.sh [-m CAP_MB] command args...
# Refuses to start unless the cap plus MARGIN_MB still fit in the memory available right now.
set -euo pipefail
CAP_MB=1200
MARGIN_MB=2048 # Left to the VS Code server, the bots and the Vite servers sharing the machine
if [ "${1:-}" = "-m" ]; then CAP_MB=$2; shift 2; fi
avail=$(( $(awk '/^MemAvailable:/ {print $2}' /proc/meminfo) / 1024 ))
if (( avail < CAP_MB + MARGIN_MB )); then
  echo "capped.sh: ${avail} MB available, ${CAP_MB} MB cap + ${MARGIN_MB} MB margin needed: not starting" >&2
  exit 75
fi
# No swap for it either: at the cap it is OOM-killed at once instead of pushing everything else to swap
exec systemd-run --user --scope --quiet -p MemoryMax="${CAP_MB}M" -p MemorySwapMax=0 -- "$@"
