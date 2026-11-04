#!/usr/bin/env bash
# Purges jsDelivr @main and waits for the CDN to serve main's versions of the three extensions.
# Shared by purge-jsdelivr.yml (push, release, manual) and cdn-heal.yml (every 3 h, --if-stale).
#
# jsDelivr throttles repeated purges of the same URL and can be unable to reach GitHub for an
# hour (14 Oct 2026). Neither is a failure (GPB #41): each file is purged once per run, and
# throttling and a CDN that's still stale after 20 minutes are warnings. cdn-heal.yml purges
# again while the CDN's versions differ from main's, so a missed refresh heals itself.
#
# Each built file starts with a "// VERSION: x.y.z" line (scripts/build.mjs).
# Needs REPO (owner/name). Run from the repository root.
set -u

PURGE=https://purge.jsdelivr.net/gh/$REPO@main
CDN=https://cdn.jsdelivr.net/gh/$REPO@main
SCRIPTS=(dist/gradientProgressBar.js dist/gradientConnectBar.js dist/gradientBars.js)
OTHERS=(manifest.json README.md previews/gradient-progress-bar.png previews/gradient-connect-bar.png previews/gradient-bars.png)

version() { grep -m 1 -oP '^// VERSION: \K\S+'; }
expected() { for f in "${SCRIPTS[@]}"; do echo "$f $(version <"$f")"; done; }
served() { for f in "${SCRIPTS[@]}"; do echo "$f $(curl -fsS --max-time 60 "$CDN/$f" 2>/dev/null | version)"; done; }
want=$(expected)

# One purge request; sets $throttled. Throttling or a failed request is only a warning.
purge() {
  throttled=false
  local json
  if ! json=$(curl -fsS --max-time 60 "$PURGE/$1"); then
    echo "::warning::Purge request for $1 failed"
    return
  fi
  echo "$1: $json"
  if grep -Eq '"throttled":[[:space:]]*true' <<<"$json"; then
    throttled=true
    echo "::warning::jsDelivr throttled the purge of $1"
  fi
}

if [ "${1:-}" = --if-stale ]; then
  now=$(served)
  if [ "$now" = "$want" ]; then
    echo "CDN serves the same versions as main. Nothing to do."
    exit 0
  fi
  printf 'CDN serves:\n%s\nmain has:\n%s\nPurging.\n' "$now" "$want"
fi

declare -A js_throttled
for file in "${SCRIPTS[@]}"; do
  purge "$file"
  js_throttled[$file]=$throttled
done
for file in "${OTHERS[@]}"; do
  [ -e "$file" ] && purge "$file"
done

# Poll every 2 min for up to 20 min. Re-purge only stale scripts, and only while jsDelivr isn't
# throttling them, since every extra purge of a throttled URL adds to the throttle.
deadline=$((SECONDS + 20 * 60))
while :; do
  now=$(served)
  printf 'CDN serves:\n%s\n' "$now"
  if [ "$now" = "$want" ]; then
    echo "The CDN serves the pushed versions."
    exit 0
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    break
  fi
  sleep 120
  now=$(served)
  for file in "${SCRIPTS[@]}"; do
    if [ "${js_throttled[$file]}" = false ] && ! grep -qxF "$file $(version <"$file")" <<<"$now"; then
      purge "$file"
      js_throttled[$file]=$throttled
    fi
  done
done
printf '::warning::jsDelivr is still stale after 20 min:\n%s\nexpected:\n%s\ncdn-heal.yml (every 3 h) purges again until it matches.\n' "$now" "$want"
