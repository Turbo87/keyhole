# A smaller Wine image for the G-record validator worker

Research for [#54](https://github.com/Turbo87/keyhole/issues/54). The question is whether a Wine image substantially smaller than Arch Linux's 550 MB still runs all eight validator DLLs correctly on a Fly.io x86_64 Machine. [#44](https://github.com/Turbo87/keyhole/issues/44) measured Arch's Wine 11.21 (new WoW64) at 550 MB and Debian trixie's Wine 10.0 with `wine32:i386` (old WoW64) at 794 MB with identical results, and [#39](https://github.com/Turbo87/keyhole/issues/39) fixed the harness: one Wine process per file, the result reported outside stdout, and the `Sleep` import replaced with a no-op.

Facts were checked on 2026-11-02 against distribution package sources and indexes, the WineHQ package repository and Docker Hub. Every image size is the one printed by `fly deploy` after a build on Fly's remote builder, and every image ran on a `performance-1x` Machine in `fra` in a private app that was destroyed afterwards. The [test kit](g-record-validator-wine-image/) holds the Dockerfile with one target per candidate, the harness and the test script. No DLL or IGC file is committed.

## Summary

A slimmed image is about a fifth of Arch's size and gives identical results. Copying only glibc, `libgcc_s`, Wine without its import libraries and the prepared prefix into an empty image, and replacing the prefix's copies of Wine's builtin DLLs with hard links to the originals, gives 121 MB from Arch's Wine 11.21 and 120 MB from Alpine's Wine 11.0. Alpine's stock `wine` package is a new-WoW64 build, works under musl and gives 295 MB without any slimming. All five working candidates returned the same result as the stock Arch image for all 168 validations, which cover the eight DLLs in their 2021 and current versions and 32 tampered files.

Restart time doesn't depend on image size. A stopped Machine reached the `started` state in 1.1 to 1.8 s and returned its first validation result in 2.4 to 3.3 s for every candidate, because Fly keeps the root filesystem on the host between runs. The gain from a smaller image is in build, push and first start time and in storage, not in cold starts.

The slimmed images are fragile in one way that matters. A variant that added FreeType to the Arch slim image, to silence Wine's "cannot find the FreeType font library" message, made most failed validations hang until the 60 s timeout instead of failing in under a second, while valid files still passed. Which optional Linux libraries are present changes how Wine behaves when a DLL tries to show a message box. A slim image is therefore only safe together with a test that runs valid and tampered files for every DLL on each rebuild.

Fedora and WineHQ builds are larger than Arch's, and prebuilt Wine images on Docker Hub are either larger or years out of date.

| Candidate | Wine | WoW64 | `fly deploy` size | Uncompressed | `started` after restart | First result after restart | Results match Arch |
|---|---|---|---|---|---|---|---|
| Arch, stock (`arch`) | 11.21 | new | 548 MB | 1,691 MB | 1.15 s | 2.60 s | baseline |
| Arch, slim (`arch-slim`) | 11.21 | new | 187 MB | 860 MB | 1.49 s | 2.72 s | 168 of 168 |
| Arch, slim with linked prefix (`arch-linked`) | 11.21 | new | 121 MB | 535 MB | 1.55 s | 2.87 s | 168 of 168 |
| Arch, slim without prefix DLLs (`arch-slimmer`, removed) | 11.21 | new | 120 MB | 534 MB | 1.38 s | n/a | 0 of 168, Wine fails to start |
| Alpine 3.24, stock (`alpine`) | 11.0 | new | 295 MB | 1,214 MB | 1.28 s | 2.94 s | 168 of 168 |
| Alpine 3.24, slim with linked prefix (`alpine-slim`) | 11.0 | new | 120 MB | 560 MB | 1.80 s | 3.32 s | 168 of 168 |
| Fedora 44, `wine-core` (`fedora`) | 11.20 | new | 815 MB | not run | not run | not run | prefix creation hangs |
| WineHQ `winehq-devel` on Debian trixie (`winehq`) | 11.21 | old | 1.0 GB | not run | not run | not run | not run |
| Debian trixie, `wine32:i386` (#44) | 10.0 | old | 794 MB | 3.2 GB | 2.5 s | not measured | matched in #44 |

Sizes include about 70 MB uncompressed of test DLLs and IGC files under `/opt/vali`. Restart columns are medians of five stop and start cycles through the Machines API. `started` is the time from the start request until the `wait?state=started` call returned, and the first result adds an `exec` call that validates one LXN file. #44's 2.0 s and 2.5 s restarts were measured with `fly machine start` and are not directly comparable.

## Method

Each candidate is a build target in the kit's [`Dockerfile`](g-record-validator-wine-image/Dockerfile), built with `fly deploy --build-only --push --remote-only --build-target <target> --image-label <target>`. Each image creates its Wine prefix at build time with `WINEDLLOVERRIDES="mscoree,mshtml="`, so Wine neither installs nor asks for Mono and Gecko.

[`vali.c`](g-record-validator-wine-image/vali.c) is the #39 harness. It loads the DLL with `LoadLibraryA()`, walks the import table and replaces every `FirstThunk` entry equal to `kernel32!Sleep` with a function that returns immediately, calls `InitializeDLL(NULL, TRUE)` and reports `ValidateLog()`'s result as its exit code. Seven of the eight DLLs import `Sleep`, only GCS doesn't, so the patch applies to all of them and not only to LXV. On the 140 validations recorded in #44's Arch run, which used no patch, the results are the same, except that #44's stdout parsing reported the two tampered FLA files as errors instead of failures.

[`run.sh`](g-record-validator-wine-image/run.sh) validates 84 files with both DLL sets, 168 validations per image, one Wine process per file with `wineserver -k` in between and a 60 s timeout. The files are #44's sample: 8 files per manufacturer, 12 for LXV, and two tampered copies per manufacturer with one B record digit changed. On the stock Arch image all 32 tampered validations fail, 61 of 68 untampered files pass with the 2021 DLLs and 63 with the current DLLs, which matches #44. Every other image gave the same result for every file. Median time per file outside TRI was 0.58 to 0.75 s on all images, and TRI took 1.1 to 2.0 s. LXV took under 1 s per file on every image, which shows the `Sleep` patch working.

## Candidates

### Arch Linux, stock

Arch's [`wine`](https://archlinux.org/packages/extra/x86_64/wine/) 11.21-1 is a pure new-WoW64 build, 81 MB compressed and 621 MB installed. Two things inflate the image beyond Wine itself. The package depends on `ntsync-autoload`, which depends on `NTSYNC-MODULE`, which only the [`linux`](https://archlinux.org/packages/core/x86_64/linux/) package provides, so every Wine image carries a 169 MB kernel and builds an initramfs during installation. And `/usr/lib/wine` holds 130 MB of import libraries (`*.a`) that only matter for building Windows programs. The prefix adds 380 MB, almost all of it copies of Wine's builtin DLLs in `system32` and `syswow64`.

Updates arrive quickly. Arch packages Wine's biweekly development releases, and the [Arch Linux Archive](https://archive.archlinux.org/packages/w/wine/) lists every 10.x and 11.x build. A build is reproducible with a pinned version by using a dated base image tag such as `archlinux:base-20261025.0.616225` and pointing pacman at a dated archive snapshot (`https://archive.archlinux.org/repos/YYYY/MM/DD/$repo/os/$arch`). Both the snapshot and the tags are kept.

### Arch Linux, slimmed

The `arch-slim` target builds the stock image as a stage, then copies into an empty image only `ld-linux-x86-64.so.2`, `libc.so.6`, `libm.so.6`, `libgcc_s.so.1`, `libresolv.so.2`, `/usr/bin/wine`, `/usr/bin/wineserver`, `/usr/lib/wine` without `*.a`, `/usr/share/wine`, the prefix, a root entry in `/etc/passwd` and `/etc/group`, and a static busybox for the test script. Wine's loader and `wineserver` link only against glibc, and among Wine's own Unix libraries `ntdll.so` additionally needs only `libgcc_s`. Everything else, such as X11, Wayland, ALSA, GStreamer, FreeType and GnuTLS, is loaded on demand and skipped when missing. This gave 187 MB with identical results.

The `arch-linked` target then replaces every prefix file that is byte-identical to the file of the same name in `x86_64-windows` or `i386-windows` with a hard link to it. That cut the prefix from 380 MB to 55 MB of additional data and the image to 121 MB, with identical results. Deleting those prefix files instead (`arch-slimmer`, removed from the kit) also gave 120 MB, but then Wine could no longer start any program and failed with `could not load kernel32.dll, status c0000135`, so the files must exist in the prefix.

The slim images log `Wine cannot find the FreeType font library` and fail to start the `winebus`, `wineusb` and `winebth` services on every run, and no longer log the stock image's `XDG_RUNTIME_DIR` message. None of this changed a result. Adding FreeType and its dependencies to `arch-linked` silenced the FreeType message but made 18 of the first 78 validations hang until the timeout before the run was stopped. These were all validations that fail on the stock image except CNI's two tampered files, while all 58 valid files still passed. Wine logged `failed to create desktop window` in a loop. The cause was not pinned down. Without FreeType a message box from a failing DLL returns at once, as it does in the stock image with a full font setup, and in this in-between state it blocks.

Gecko and Mono are not installed by Arch's `wine` package, so there is nothing to drop. Wine's own fonts are 1 MB and its NLS files 40 MB, and both are kept. Further savings would need deleting Windows DLLs that the validators don't load, which needs a list that breaks when a DLL update imports something new, such as FLA's dependency on `bcryptprimitives.dll` that #27 found. It was not tried.

Updates and pinning are the same as for stock Arch, since the slim targets only copy files out of it. The image has no package manager, so any change is a rebuild.

### Alpine Linux

Alpine's [`wine` APKBUILD](https://gitlab.alpinelinux.org/alpine/aports/-/blob/3.24-stable/community/wine/APKBUILD) configures x86_64 builds with `--enable-archs=x86_64,i386` and builds the 32-bit PE side with `i686-mingw-w64-gcc`, so it is a new-WoW64 build that needs no 32-bit musl. Every stable branch since 3.20 does this. Alpine 3.24 ships Wine 11.0-r0, 134 MB compressed and 439 MB installed according to the [3.24 `APKINDEX`](https://dl-cdn.alpinelinux.org/alpine/v3.24/community/x86_64/). The PE modules are stripped at build time, and the package pulls in fewer libraries than Arch's and no kernel, which is why the stock image is 295 MB. musl caused no problem: the prefix filled `syswow64` with 847 files and every validation matched Arch.

Updates arrive slowly. The last change to the [Wine package on the master branch](https://gitlab.alpinelinux.org/alpine/aports/-/commits/master/community/wine) was the upgrade to 11.0 on 2026-01-18, while Wine's development series has reached 11.21. Alpine tracked development releases during 2025 but has stayed on 11.0 since, and newer Wine would most likely arrive with a later Alpine release. Pinning works with an `alpine:3.24.3` base and `apk add wine=11.0-r0`. But Alpine's mirrors keep only the current package of each branch and Alpine runs no package archive, so the pin stops installing once the package is rebuilt with a new `pkgrel`. A reproducible build would need the `.apk` files kept in Keyhole's own storage.

The `alpine-slim` target applies the Arch slimming to Alpine, copying `ld-musl-x86_64.so.1`, `libgcc_s.so.1`, Wine, the prefix with hard links and busybox. It gave 120 MB and identical results. Alpine's Wine has no import libraries to drop, so the slim Alpine and Arch images end up the same size. Validations were slightly slower on this image, 0.75 s median against 0.58 s for `arch-linked`, from a single run each.

### Fedora

Fedora's [`wine.spec`](https://src.fedoraproject.org/rpms/wine/blob/rawhide/f/wine.spec) enables new WoW64 for Fedora 43 and later (`%bcond new_wow64 1`) with `--enable-archs=i386,x86_64` and installs Wine under `/usr/lib64/wine-wow64`. Fedora 44 ships 11.20. Installing only `wine-core` without weak dependencies gave 815 MB, because the package requires the `mingw64-*` runtime libraries, GnuTLS, CUPS, SDL2, Vulkan and others. `wineboot` in that image did not finish within 150 s, logged `no driver could be loaded` for every window, and left `syswow64` empty. The full `wine` metapackage would be larger still, so Fedora was not pursued. Fedora's update repositories keep only the latest build, so a pin would have to install specific builds from Koji.

### WineHQ packages

WineHQ's Debian trixie repository has `wine-devel` 11.21 and `wine-stable` 11.0 (`11.0.0.0~trixie-1`). Its `wine-devel-amd64` package contains only `x86_64-unix` and `x86_64-windows`, so 32-bit DLLs need `wine-devel-i386` through i386 multiarch, the old WoW64 mode. `winehq-devel` with both gave a 1.0 GB image, where `wineboot` filled `syswow64` with 862 files. The repository keeps every release, 93 versions of `wine-devel` for trixie, so `wine-devel=11.21~trixie-1` pins reproducibly. Being larger than both Debian's and Arch's builds, it was not run.

### Prebuilt images

Docker Hub reports these compressed sizes for the amd64 images of the most pulled Wine images: [`scottyhardy/docker-wine`](https://hub.docker.com/r/scottyhardy/docker-wine) 1,264 MB for Wine 11.0, [`tobix/wine`](https://hub.docker.com/r/tobix/wine) 844 MB for `stable` and 928 MB for `devel`, [`tianon/wine`](https://hub.docker.com/r/tianon/wine) 703 MB for 11.0, all updated in October 2026. Small images exist but are old: [`amake/wine`](https://hub.docker.com/r/amake/wine) is 191 MB for Debian bullseye's Wine, last updated 2025-09, and [`gstolarz/wine`](https://hub.docker.com/r/gstolarz/wine) is 68 MB for Wine 6.12 from 2021. Wine 6 and bullseye's Wine 5 predate the `bcryptprimitives.dll` that the current FLA DLL needs. None was deployed, since every maintained image is larger than stock Arch.

## What a production image would add

The slim images contain no shell beyond busybox and no package manager. The worker's own HTTP server must run against the copied glibc or musl, which a Rust binary built for an older glibc or statically linked does. The image build should run the kit's valid and tampered files through every DLL and fail on any difference, because the FreeType experiment showed that a library change can turn failures into hangs. Wine updates in a slim image are as fast as in its base distribution, since the slim target only copies files from it.
