#!/bin/sh
# Prints one tab-separated result line per validation, one Wine process per file.
echo "UPTIME	$(cut -d' ' -f1 /proc/uptime)"
echo "WINE	$(wine --version 2>&1 | head -1)"
echo "SYSWOW64	$(ls "$WINEPREFIX/drive_c/windows/syswow64" | wc -l)"
cd /opt/vali || exit 1
for set in dll-2021 dll-2026; do
  for m in LXV NAV LXN FLA CNI TRI NKL GCS; do
    lc=$(echo $m | tr A-Z a-z)
    [ $m = TRI ] && lc=tri2
    for f in igc/$m-*.igc; do
      s=$(cut -d' ' -f1 /proc/uptime)
      timeout -k 5 60 wine vali.exe "$set/igc-$lc.dll" "$f" >/dev/null 2>/tmp/err
      rc=$?
      e=$(cut -d' ' -f1 /proc/uptime)
      case $rc in 0) res=PASS ;; 1) res=FAIL ;; *) res=ERR$rc ;; esac
      printf 'RESULT\t%s\t%s\t%s\t%s\t%s\t%s\n' "$set" "$m" "${f#igc/}" "$res" \
        "$(awk "BEGIN { printf \"%.2f\", $e - $s }")" "$(grep -o 'SLEEP_PATCHED [0-9]*' /tmp/err)"
      wineserver -k 2>/dev/null
    done
  done
done
echo DONE
