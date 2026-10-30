#!/usr/bin/env bash
# PROTOTYPE: exercises a running axum front door on localhost:8080.
set -u
base=${BASE:-http://localhost:8080}
stamp() { perl -MTime::HiRes=time -e 'printf "%.2f", time'; }

echo "--- SSR page with load() calling /api via handleFetch, cookie forwarded"
curl -s -b 'session=abc' "$base/" | grep -o '<p>[^<]*<code>[^<]*</code></p>'

echo "--- streamed SSR: arrival time of each chunk"
start=$(stamp)
curl -sN "$base/stream" | while IFS= read -r line; do
	hit=$(grep -o 'fast: [^<]*\|slept_ms[^0-9]*[0-9]*' <<<"$line" | tr '\n' ' ')
	[ -n "$hit" ] && echo "+$(perl -e "printf '%.2f', $(stamp) - $start")s $hit"
done

echo "--- form action, same origin"
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "Origin: $base" -d name=x "$base/form"
echo "--- form action, cross origin"
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Origin: http://evil.example' -d name=x "$base/form"
