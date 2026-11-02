# One target per candidate, built with `fly deploy --build-target <target>`.
# The build context needs dll-2021/, dll-2026/ and igc/, which are not committed.

FROM debian:trixie-slim AS harness
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends gcc-mingw-w64-i686 >/dev/null
COPY vali.c /src/vali.c
RUN i686-w64-mingw32-gcc -O2 -Wall -static -o /src/vali.exe /src/vali.c

FROM scratch AS kit
COPY --from=harness /src/vali.exe /opt/vali/vali.exe
COPY dll-2021 /opt/vali/dll-2021
COPY dll-2026 /opt/vali/dll-2026
COPY igc /opt/vali/igc
COPY run.sh /opt/vali/run.sh

FROM archlinux:latest AS arch-wine
RUN pacman -Syu --disable-sandbox --noconfirm --needed wine && pacman -Scc --noconfirm && rm -rf /var/cache/pacman/pkg/*
ENV WINEDEBUG=-all WINEDLLOVERRIDES="mscoree,mshtml=" WINEPREFIX=/root/.wine
RUN wineboot --init && wineserver -w && ls $WINEPREFIX/drive_c/windows/syswow64 | wc -l

FROM arch-wine AS arch
COPY --from=kit /opt/vali /opt/vali
CMD ["sleep", "infinity"]

# Only glibc, libgcc, Wine without import libraries, the prefix and a static busybox for the test script.
FROM busybox:musl AS busybox
FROM arch-wine AS arch-slim-rootfs
COPY --from=busybox /bin/busybox /rootfs/bin/busybox
RUN set -e; r=/rootfs; \
    mkdir -p $r/usr/bin $r/usr/lib $r/usr/share $r/etc $r/root $r/tmp $r/dev $r/proc; \
    chmod 1777 $r/tmp; ln -s usr/lib $r/lib64; ln -s usr/lib $r/lib; \
    for l in ld-linux-x86-64.so.2 libc.so.6 libm.so.6 libgcc_s.so.1 libresolv.so.2; do cp -aL /usr/lib/$l $r/usr/lib/; done; \
    cp -a /usr/bin/wine /usr/bin/wineserver $r/usr/bin/; \
    cp -a /usr/lib/wine $r/usr/lib/; find $r/usr/lib/wine -name '*.a' -delete; \
    cp -a /usr/share/wine $r/usr/share/; \
    cp -a $WINEPREFIX $r/root/; \
    grep '^root:' /etc/passwd > $r/etc/passwd; grep '^root:' /etc/group > $r/etc/group; \
    for a in $($r/bin/busybox --list); do ln -s busybox $r/bin/$a; done

FROM arch-slim-rootfs AS arch-linked-rootfs
# The prefix holds copies of Wine's builtin DLLs, which are replaced by hard links to the identical originals.
RUN cd /rootfs/root/.wine/drive_c/windows && \
    for d in system32:x86_64-windows syswow64:i386-windows; do \
      for f in $(find ${d%%:*} -type f); do \
        o=/rootfs/usr/lib/wine/${d##*:}/${f##*/}; \
        [ -f "$o" ] && cmp -s "$f" "$o" && ln -f "$o" "$f"; \
      done; \
    done; \
    du -sm /rootfs

FROM scratch AS arch-slim
COPY --from=arch-slim-rootfs /rootfs /
COPY --from=kit /opt/vali /opt/vali
ENV PATH=/usr/bin:/bin WINEDEBUG=-all WINEDLLOVERRIDES="mscoree,mshtml=" WINEPREFIX=/root/.wine HOME=/root USER=root
CMD ["sleep", "infinity"]

FROM scratch AS arch-linked
COPY --from=arch-linked-rootfs /rootfs /
COPY --from=kit /opt/vali /opt/vali
ENV PATH=/usr/bin:/bin WINEDEBUG=-all WINEDLLOVERRIDES="mscoree,mshtml=" WINEPREFIX=/root/.wine HOME=/root USER=root
CMD ["sleep", "infinity"]

FROM alpine:3.24 AS alpine
RUN apk add --no-cache wine
ENV WINEDEBUG=-all WINEDLLOVERRIDES="mscoree,mshtml=" WINEPREFIX=/root/.wine
RUN wineboot --init && wineserver -w && ls $WINEPREFIX/drive_c/windows/syswow64 | wc -l
COPY --from=kit /opt/vali /opt/vali
CMD ["sleep", "infinity"]

# Only musl, libgcc, Wine, the prefix and busybox, with builtin DLL copies in the prefix hard linked.
FROM alpine AS alpine-slim-rootfs
RUN set -e; r=/rootfs; \
    mkdir -p $r/bin $r/lib $r/usr/bin $r/usr/lib $r/usr/share $r/etc $r/root $r/tmp $r/dev $r/proc; \
    chmod 1777 $r/tmp; \
    cp -a /lib/ld-musl-x86_64.so.1 /lib/libc.musl-x86_64.so.1 $r/lib/; cp -aL /usr/lib/libgcc_s.so.1 $r/usr/lib/; \
    cp -a /bin/busybox $r/bin/; for a in $(busybox --list); do ln -s busybox $r/bin/$a; done; \
    cp -a /usr/bin/wine /usr/bin/wine64 /usr/bin/wineserver $r/usr/bin/; \
    cp -a /usr/lib/wine $r/usr/lib/; cp -a /usr/share/wine $r/usr/share/; cp -a $WINEPREFIX $r/root/; \
    grep '^root:' /etc/passwd > $r/etc/passwd; grep '^root:' /etc/group > $r/etc/group; \
    cd $r/root/.wine/drive_c/windows; \
    for d in system32:x86_64-windows syswow64:i386-windows; do \
      for f in $(find ${d%%:*} -type f); do \
        o=$r/usr/lib/wine/${d##*:}/${f##*/}; \
        if [ -f "$o" ] && cmp -s "$f" "$o"; then ln -f "$o" "$f"; fi; \
      done; \
    done; \
    du -sm $r

FROM scratch AS alpine-slim
COPY --from=alpine-slim-rootfs /rootfs /
COPY --from=kit /opt/vali /opt/vali
ENV PATH=/usr/bin:/bin WINEDEBUG=-all WINEDLLOVERRIDES="mscoree,mshtml=" WINEPREFIX=/root/.wine HOME=/root USER=root
CMD ["sleep", "infinity"]

# wineboot does not finish in this image and leaves syswow64 empty.
FROM fedora:44 AS fedora
RUN dnf -y install --setopt=install_weak_deps=False wine-core gawk && dnf clean all
ENV WINEDEBUG=-all WINEDLLOVERRIDES="mscoree,mshtml=" WINEPREFIX=/root/.wine
RUN wine wineboot --init && wineserver -w && ls $WINEPREFIX/drive_c/windows/syswow64 | wc -l
COPY --from=kit /opt/vali /opt/vali
CMD ["sleep", "infinity"]

FROM debian:trixie-slim AS winehq
ADD --chmod=644 https://dl.winehq.org/wine-builds/winehq.key /etc/apt/keyrings/winehq-archive.key
# WineHQ's amd64 package has no i386-windows directory, so 32-bit DLLs need the i386 package and old WoW64.
RUN dpkg --add-architecture i386 && apt-get update -qq && apt-get install -y -qq --no-install-recommends ca-certificates >/dev/null && \
    echo 'deb [signed-by=/etc/apt/keyrings/winehq-archive.key] https://dl.winehq.org/wine-builds/debian trixie main' > /etc/apt/sources.list.d/winehq.list && \
    apt-get update -qq && apt-get install -y -qq --no-install-recommends winehq-devel >/dev/null && rm -rf /var/lib/apt/lists/*
ENV PATH=/opt/wine-devel/bin:$PATH WINEDEBUG=-all WINEDLLOVERRIDES="mscoree,mshtml=" WINEPREFIX=/root/.wine
RUN wine wineboot --init && wineserver -w && ls $WINEPREFIX/drive_c/windows/syswow64 | wc -l
COPY --from=kit /opt/vali /opt/vali
CMD ["sleep", "infinity"]
