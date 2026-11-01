#!/bin/bash
# Prints one tab-separated result line per validation.
echo "UPTIME	$(cut -d' ' -f1 /proc/uptime)"
echo "KERNEL	$(uname -r)"
echo "IA32	$(cat /proc/sys/abi/ia32_emulation 2>/dev/null || echo n/a)	$(grep -c . /proc/cmdline >/dev/null; grep -o 'ia32_emulation=[^ ]*' /proc/cmdline || true)"
echo "I386_STATIC	$(/opt/i386-busybox echo ok 2>&1 | head -1)"
echo "WINE	$(wine --version 2>&1 | head -1)"
echo "SYSWOW64	$(ls /root/.wine/drive_c/windows/syswow64 2>/dev/null | wc -l)"
echo "ROOTFS_MB	$(du -sxm / 2>/dev/null | cut -f1)"
cd /opt/vali
for set in dll-2021 dll-2026; do
  for m in LXV NAV LXN FLA CNI TRI NKL GCS; do
    lc=$(echo $m | tr A-Z a-z); [ $m = TRI ] && lc=tri2
    dll=$set/igc-$lc.dll
    [ -f $dll ] || { echo "NODLL	$set	$m"; continue; }
    for f in igc/$m-*.igc; do
      s=$(date +%s.%N)
      out=$(timeout -k 5 60 wine vali.exe "$dll" "$f" 2>/tmp/err); rc=$?
      e=$(date +%s.%N)
      res=$(echo "$out" | grep -E '^(PASS|FAIL)' | cut -f1); [ -z "$res" ] && res="ERR$rc"
      printf 'RESULT\t%s\t%s\t%s\t%s\t%.2f\t%s\n' "$set" "$m" "$(basename $f)" "$res" "$(echo "$e - $s" | bc)" "$(head -c 200 /tmp/err | tr '\n\t' '  ')"
      wineserver -k 2>/dev/null
    done
  done
done
echo DONE
