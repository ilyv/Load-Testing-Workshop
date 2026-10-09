#!/bin/sh
set -e

script=""
for arg in "$@"; do
  case "$arg" in
    *.js) script="$arg" ;;
  esac
done

name=$(basename "${script:-test}" .js)
TEST_ID="${TEST_ID:-$name-$(date +%Y%m%d-%H%M%S)}"
export K6_WEB_DASHBOARD_EXPORT="${K6_WEB_DASHBOARD_EXPORT:-/results/$TEST_ID.html}"

echo "testid: $TEST_ID"
exec k6 run --tag testid="$TEST_ID" --summary-export "/results/$TEST_ID-summary.json" "$@"
