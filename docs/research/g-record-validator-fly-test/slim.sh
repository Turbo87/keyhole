#!/bin/bash
cd /opt/vali
t() { s=$(date +%s.%N); out=$(timeout -k 5 60 wine vali.exe "$1" "$2" 2>/dev/null); rc=$?; e=$(date +%s.%N); r=$(echo "$out" | grep -E '^(PASS|FAIL)' | cut -f1); printf '%s\t%s\t%s\t%.2f\n' "$3" "$(basename $2)" "${r:-ERR$rc}" "$(echo "$e - $s" | bc)"; }
echo "UPTIME	$(cut -d' ' -f1 /proc/uptime)"
echo "ROOTFS_MB	$(du -smc /usr /opt /root /etc /var 2>/dev/null | tail -1 | cut -f1)"
wineserver -k 2>/dev/null; sleep 1
t dll-2026/igc-lxv.dll igc/LXV-00.igc FIRST_COLD
for i in 01 02 03 04 05; do wineserver -k 2>/dev/null; sleep 1; t dll-2026/igc-lxv.dll igc/LXV-$i.igc LXV_COLD; done
wineserver -p 2>/dev/null; wine cmd /c exit 2>/dev/null
for i in 01 02 03 04 05; do t dll-2026/igc-lxv.dll igc/LXV-$i.igc LXV_WARM; done
for m in NAV LXN FLA CNI TRI NKL GCS; do lc=$(echo $m | tr A-Z a-z); [ $m = TRI ] && lc=tri2
  t dll-2026/igc-$lc.dll igc/$m-00.igc "${m}_WARM"; t dll-2026/igc-$lc.dll igc/$m-00-tampered.igc "${m}_WARM"; done
wineserver -k
echo DONE
