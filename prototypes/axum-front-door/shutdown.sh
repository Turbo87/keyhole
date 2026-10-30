#!/usr/bin/env bash
# PROTOTYPE: checks signal forwarding and shutdown ordering of the axum front door.
set -u
cd "$(dirname "$0")"
bin=server/target/debug/axum-front-door-prototype
now() { perl -MTime::HiRes=time -MPOSIX=strftime -e '$t=time; printf "%s.%03d", strftime("%T", localtime $t), ($t-int $t)*1000'; }
start() { "$bin" >"$1" 2>&1 & pid=$!; until curl -sf -o /dev/null localhost:8080/; do sleep 0.2; done; }
node_pid() { pgrep -P "$pid" node || pgrep -g "$(pgrep -P "$pid")" node; }

for sig in TERM INT; do
	echo "=== SIG$sig while a streamed SSR response is in flight"
	start /tmp/afd-$sig.log
	( curl -sN localhost:8080/stream | grep -o 'slept_ms[^0-9]*[0-9]*' | sed "s/^/$(printf ' ')curl got /"; echo "$(now) curl finished" ) &
	sleep 0.5
	echo "$(now) sending SIG$sig to axum"
	kill -$sig $pid
	sleep 0.2
	echo "$(now) new request during drain: $(curl -s -o /dev/null -w '%{http_code}' localhost:8080/ || true)"
	wait $pid; echo "$(now) axum exit code $?"
	wait
	grep '^\[axum\]' /tmp/afd-$sig.log
done

echo "=== Node dies"
start /tmp/afd-crash.log
kill -KILL "$(pgrep -f '^node build')"
wait $pid; echo "axum exit code $?"
grep '^\[axum\]' /tmp/afd-crash.log
