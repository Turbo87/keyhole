# Hosting the G-record validators

Research for [#39](https://github.com/Turbo87/keyhole/issues/39). The question is how Keyhole runs the manufacturers' G-record validators in production. [#27](https://github.com/Turbo87/keyhole/issues/27) settled on the official 32-bit Windows DLLs for LXV, NAV, LXN, FLA, CNI, TRI (`igc-tri2.dll`), NKL and GCS, called through `InitializeDLL()` and `ValidateLog()`, and measured them under 32-bit Wine 10 in an i386 container on Apple Silicon. The hosting is fixed by [#34](https://github.com/Turbo87/keyhole/issues/34): axum on a Fly.io Machine in `fra` that exits when idle, SQLite on a volume with Litestream to R2, IGC files in R2, and the SPA on Cloudflare static assets. The cost target from [#33](https://github.com/Turbo87/keyhole/issues/33) is cents in an idle month and about $1 in an active one ([findings](https://github.com/Turbo87/keyhole/blob/research/zero-cost-hosting/docs/research/zero-cost-hosting.md)). Each file is validated once after upload in the background, so validation latency only delays the analysis log entry.

Facts were checked on 2026-11-01 against the IGC technical specification, Wine release notes, distribution packages, Azure and Fly.io documentation, and the source of the FAI CIVL validation server. The FAI website, including the free software page and the DLL downloads, returns a Cloudflare challenge (HTTP 403) to automated requests, so the DLLs used here are the 2021 copies from the Wayback Machine, not the current releases. Claims marked **verified** were tested on this machine. Claims marked **unverified** come from secondary sources or inference.

## Summary

Running the DLLs under Wine next to axum is the cheapest option and adds almost nothing to the bill. The validator image grows the stopped Machine's root filesystem by about 0.8 to 1.4 GB, about $0.12 to $0.21 per month at Fly.io's $0.15 per GB, and validation adds minutes of runtime to a Machine that is already awake for the upload. A separate Wine worker on Fly.io costs the same storage plus a second cold start, and buys process and image isolation and a backend that no longer depends on x86. Both depend on the host kernel running 32-bit x86 code, which was not tested on Fly.io.

Wine 11.0 (2026-01-13) declares the new WoW64 mode fully supported, so 32-bit DLLs no longer need i386 multiarch in principle. It depends on how the distribution builds Wine. Debian trixie's amd64-only Wine 10 fails to start 32-bit code because it lacks `syswow64\ntdll.dll` (**verified**). Arch Linux's Wine 11.21 is a pure new-WoW64 build (`i386-windows` PE modules, no `i386-unix`) and produced a 777 MB image, against 1.38 GB for Debian's amd64-only Wine. Its 32-bit side could not be tested on Apple Silicon, because Docker Desktop runs x86_64 code under Rosetta or QEMU user mode, neither of which ran the 32-bit code. Arm64 hosts work only through emulation, as in #27, and Fly.io has no arm64 Machines.

Native Windows on the Azure Functions Consumption plan fits the cost target, since a season of validations stays inside the free 400,000 GB-seconds. But the Windows Consumption plan is legacy, its sandbox blocks almost all User32 and GDI calls that every validator DLL imports, and it adds an Azure account and a second US operator. The FAI CIVL Open Validation Server timed out on every port again and its code shows support for only three of Keyhole's eight manufacturers (LXV, NAV, FLA). Native verification in Rust is not possible: the IGC specification requires the public keys to be embedded in the manufacturer's DLL, and NAV's new `GTRSA-SHA256` G record embeds a per-file key whose signed content could not be reproduced.

## Workload assumptions

An active month has a few competitions with 40 to 80 pilots each over 5 to 10 days, which gives roughly 1,000 to 3,000 uploaded files (**unverified**, not measured). LXV covers about 78 % of the files in #27's download. Under i386 emulation LXV took about 5.5 s per file and NAV up to 2.5 s, which gives an upper bound of about 4.5 hours of validation per active month. Native x86_64 should be faster but was not measured.

## Wine and WoW64

**Old and new WoW64.** In the old mode, a 32-bit Windows program runs in a 32-bit Linux process, so the image needs i386 Wine libraries (`wine32:i386` on Debian). Wine 9.0 introduced a new mode in which "it is possible to run 32-bit Windows applications on a purely 64-bit Unix installation", enabled with `--enable-archs=i386,x86_64` at build time ([Wine 9.0 announcement](https://github.com/wine-mirror/wine/blob/wine-9.0/ANNOUNCE.md)). Wine 11.0 states that the new WoW64 mode "is considered fully supported, and essentially has feature parity with the old WoW64 mode", deprecates `WINEARCH=win32` prefixes and removes the `wine64` loader ([Wine 11.0 announcement](https://github.com/wine-mirror/wine/blob/wine-11.0/ANNOUNCE.md)).

**Debian trixie, amd64 only.** `wine` and `wine64` 10.0~repack-6 without i386 multiarch give a 1.38 GB image (`debian:trixie-slim` base, no recommended packages). Running the harness with `igc-nav.dll` fails with `failed to load L"\\??\\C:\\windows\\syswow64\\ntdll.dll" error c0000135` (**verified**). Debian's package is an old-WoW64 build that needs `wine32:i386`. An amd64 image with `wine32:i386` did not finish building under emulation within five minutes, so its size is **unverified**.

**Arch Linux.** `wine` 11.21-1 ships `/usr/lib/wine/i386-windows`, `x86_64-windows` and `x86_64-unix` and no `i386-unix`, so it is a pure new-WoW64 build. The image is 777 MB (**verified**). 64-bit Wine programs ran, but `wineboot` left `syswow64` empty and every 32-bit program failed to start. Docker Desktop on this machine registers Rosetta and `qemu-x86_64` for x86_64 binaries and `qemu-i386` for i386 binaries (**verified**). The new WoW64 mode runs 32-bit code inside a 64-bit process by switching to a 32-bit code segment, which neither user-mode emulator appears to support (**unverified**, inferred from the failure). Whether the DLLs run on a real x86_64 host in new WoW64 mode therefore remains open. A run on any x86_64 Linux machine, for example a GitHub Actions runner, settles it in minutes.

**Kernel support.** Both modes need the host kernel to run 32-bit x86 code (`CONFIG_IA32_EMULATION`, and on recent kernels `ia32_emulation` not disabled at boot). Fly.io Machines run Fly's kernel and customers cannot replace it ([custom kernel thread](https://community.fly.io/t/custom-kernel-with-fly-machines/6082)). A 2021 community report ran i386 images on Fly.io ([32-bit images thread](https://community.fly.io/t/is-it-possible-to-support-32-bit-images/3204)), so it worked then (**unverified** today). gVisor, used by Cloud Run's first-generation environment, supports only AMD64 and AArch64 binaries ([gVisor FAQ](https://gvisor.dev/docs/user_guide/FAQ/)).

**Startup.** In the Arch image under Rosetta, creating the Wine prefix took 5.1 s, the first Wine program with a ready prefix 0.3 s, and a program after `wineserver` had exited 1.3 s (**verified**, emulated x86_64). The prefix should be created at image build time, so the per-file overhead is about a second for the first file after a cold start and well under one for the rest. The 32-bit side of the prefix adds to this.

**Arm64 hosts.** Fly.io has no arm64 Machines and no plans for them ([ARM-based machines thread](https://community.fly.io/t/arm-based-machines/5437), [arm64 Machines thread](https://community.fly.io/t/are-arm64-fly-machines-available/5902)). Elsewhere, an i386 container under `qemu-i386` works, as #27 showed on Apple Silicon at 5.5 s per LXV file. Wine 10 can run x86 code on ARM64 through an external emulator library such as FEX built as ARM64EC, and needs a 4K page size kernel ([Wine 10.0 announcement](https://github.com/wine-mirror/wine/blob/wine-10.0/ANNOUNCE.md)). Neither path was tested on an arm64 server.

## The DLLs

**Imports.** All eight DLLs are PE32 i386 and import `USER32.dll`. CNI, GCS, LXN, NKL and TRI also import dialog functions such as `CreateDialogParamA` and `DialogBoxParamA`, every one imports `MessageBoxA`, NKL needs `MSVCR80.dll` and FLA needs `msvcrt.dll` (**verified** with `llvm-objdump` on the 2021 copies). `InitializeDLL(NULL, TRUE)` puts them in quiet mode, but a DLL that shows a message box anyway blocks forever without a display, which a hang timeout must catch.

**Licence.** Appendix C of the specification says the DLLs "shall be freeware" and that authors of "Analysis Software, Scoring Software etc. may wish to incorporate" a control program ([IGC technical specification, second edition with AL6](https://web.archive.org/web/20210307150206/https://www.fai.org/sites/default/files/igc_fr_specification_2020-11-25_with_al6.pdf), C1.2 and C4). The IGC Shell distribution is under an MIT-style licence, but none of the eight DLLs contains licence text, and no terms for server use were found. Running them on a server matches their stated purpose (**unverified**). Redistributing them in a public container image is a different question, so the image should stay in a private registry such as Fly.io's.

**Updates.** Paragraph 1.1.3.3 says only the latest DLLs posted on the IGC and GFAC web sites are valid for claims. The FAI page lists an LXNAV DLL v12.1 updated 2026-05-28 (search-engine extract of the [free software page](https://www.fai.org/page/igc-free-software)), so updates do happen. The FAI site blocks automated downloads with a Cloudflare challenge, and the GFAC mirror named in paragraph 3.11, `www.ukiws.uk/GFAC/downloads.htm`, now serves an unrelated casino page (**verified**). Updates therefore need a human to download the DLLs and place them where the image build picks them up, such as a private R2 prefix. A scheduled check for a changed FAI page would need a browser and was not tested.

## Options

### Wine next to the backend

The validator runs in the axum image. axum starts one Wine process per file, `wine vali.exe <dll> <file>`, where `vali.exe` is a tiny 32-bit harness that calls `InitializeDLL()` and `ValidateLog()` and prints the result. #27 used such a harness for all eight DLLs, and a 30-line version compiles in seconds with `i686-w64-mingw32-gcc` in a native build stage (**verified**).

**Cost.** The image grows from tens of MB to about 0.8 GB with Arch's Wine or about 1.4 GB or more with Debian's. A stopped Machine's root filesystem costs $0.15 per GB-month ([Fly.io pricing](https://docs.fly.io/about/pricing)), so the idle month rises by about $0.12 to $0.21. Validation runs while the Machine is awake for uploads and analysis, so an active month adds at most a few hours of runtime, a few cents at $3.69 per month for 512 MB.

**Latency.** About 1 s of Wine startup for the first file after a cold start, then the DLL's own time per file. Validation must count as pending work so axum does not exit during it.

**Isolation.** Each file runs in its own process group with a hard timeout, after which axum kills the process and `wineserver`, records a validation error distinct from a failed validation, and moves on. Files are validated one at a time per Wine prefix. A crash in the DLL ends only its Wine process. The DLLs read untrusted uploads inside the same Machine that holds the SQLite volume, which is the main risk of this option.

**Constraints.** The backend must run on x86_64 with 32-bit support in the kernel, and a larger image slows the first pull after each deploy (**unverified**, not measured). The image build needs the DLLs from a private source.

### Separate Wine worker

A second Fly.io app holds only Wine, the harness and the DLLs, behind a small HTTP or stdin wrapper on Fly's private network. axum sends the file, or its R2 key, and receives the result. Fly Proxy starts the worker on request and stops it when idle ([autostop](https://docs.fly.io/launch/autostop-autostart/)).

**Cost.** The same $0.12 to $0.21 per idle month for the worker's root filesystem, and a 256 MB Machine at $2.19 per month while running for the minutes it validates. The backend image stays small.

**Latency.** About 2 s or more for the worker's cold start ([autostop](https://docs.fly.io/launch/autostop-autostart/)) for the first file after an idle period, plus Wine startup.

**Isolation and constraints.** A hanging or crashing DLL cannot touch the database volume, and the worker can be killed and restarted without affecting axum. DLL updates deploy the worker alone. Only the worker needs x86_64 with 32-bit support, so the backend could move to any host. The cost is a second app to deploy, a private network call, and retries when the worker is cold or gone.

The same worker could run on Scaleway Serverless Containers in the #33 free tier, but whether its kernel runs 32-bit code is **unverified**. Cloudflare Containers cost $5 per month, the whole budget.

### Native Windows on Azure Functions

**Plans.** The legacy Consumption plan "is currently the only serverless hosting option that supports Windows". Linux Consumption retires on 2028-09-30, Windows Consumption is "not currently affected", and Microsoft recommends Flex Consumption, which is Linux only ([Consumption plan](https://learn.microsoft.com/en-us/azure/azure-functions/consumption-plan)). Flex Consumption does not support `use32BitWorkerProcess` ([app settings](https://learn.microsoft.com/en-us/azure/azure-functions/functions-app-settings)). A Windows function can also start the 32-bit harness as a child process, which 64-bit Windows runs under its own WoW64 (**unverified** on Azure).

**Cost.** In West Europe the Consumption plan bills $0.000016 per GB-second after 400,000 free GB-seconds, and $0.20 per million executions after 1 million free ([Azure retail prices API](https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20%27Functions%27%20and%20armRegionName%20eq%20%27westeurope%27)). Memory is rounded up to 128 MB, and every function app needs a storage account billed separately ([cost estimation](https://learn.microsoft.com/en-us/azure/azure-functions/functions-consumption-costs)). 3,000 files at 6 s and 256 MB use about 4,500 GB-seconds, so compute is $0 and the bill is the storage account, a few cents per month (**unverified**, not priced).

**Sandbox.** The App Service sandbox "prevents almost all of the Win32k.sys APIs from being called", and Consumption apps are limited to 32 processes ([Azure Web App sandbox](https://github.com/projectkudu/kudu/wiki/Azure-Web-App-sandbox)). Every validator imports `USER32.dll`, and the dialog-based ones may fail or hang there. Whether they validate inside the sandbox was not tested.

**Other effects.** Azure adds a second US operator, an account with a payment method, and a deployment pipeline for Windows. Cold starts on Windows Consumption were not measured. A Windows VM on any provider avoids the sandbox but costs far more than the budget.

### FAI CIVL Open Validation Server

**API.** `POST http://vali.fai-civl.org/api/vali/json` with the file in the multipart field `igcfile` returns `result`, `status`, `msg`, `igc`, `ref` and `server`, and `/cgi-bin/vali-igc.cgi` returns plain text ([web service page](http://vali.fai-civl.org/webservice.html), [go-vali](https://github.com/twpayne/go-vali/blob/master/vali.go)). The examples use plain HTTP.

**Availability.** `vali.fai-civl.org` resolves to 91.107.222.188, and TCP connections to ports 80 and 443 timed out on 2026-11-01 (**verified**), as they did during #27.

**Coverage.** The server's source runs Apache, Perl and PHP on Windows, calls `vali-XXX.exe` programs through `ivshell.exe`, and names Linux and Wine as the general testing platform ([vali3](https://github.com/arieck/vali3)). Of Keyhole's eight manufacturers, its `cgi-bin` holds programs for LXV, NAV and FLA only, plus many paragliding app codes including XCSoar (`XCS`, `XCM`). It rejects CAM files as unsupported, per the [go-vali](https://github.com/twpayne/go-vali) README. The repository was last changed in April 2026 and its validators were last added in 2024.

**Terms.** No terms of service or rate limits were found. The service is run by CIVL for online contests, without any availability commitment.

The server is not an option for the MVP. It covers less than half of the manufacturers, was unreachable twice, and would send every pilot's file to a third party over plain HTTP.

### Native verification in Rust

**What IGC accepts.** Paragraph G2.1.1.1 of the specification requires that the manufacturer's public keys, past and future, "must be embedded in the DLL file supplied by the manufacturer to GFAC", and paragraph 1.1.10.1 defines validation as passing the manufacturer's DLL or VALI program ([specification](https://web.archive.org/web/20210307150206/https://www.fai.org/sites/default/files/igc_fr_specification_2020-11-25_with_al6.pdf)). Manufacturers must give GFAC the algorithm details, and GFAC keeps them confidential (G2.1). The specification has no path for third-party verification, so a Rust verifier would not be IGC validation.

**`GTRSA-SHA256`.** One NAV file from 2026 in a local test corpus carries `GTRSA-SHA256-RN,1,K4huXg==,kAkHfA==`, a 3072-bit RSA public key in PEM form on `GK` lines, and two 384-byte signatures on `GR` and `GS` lines (**verified**). The `GS` signature opens with the embedded key to a PKCS#1 v1.5 block whose payload is a custom DER sequence of a SHA-256 digest, the string `0.1` and a timestamp, not a standard `DigestInfo`. The `GR` signature does not open with the embedded key, so it is probably signed by a Naviter key that certifies the per-recorder key. The digest did not match SHA-256 over the file before the G record with CRLF, LF, no line endings or without `L` records. No Naviter documentation of the scheme was found. Without Naviter's root key and the exact signed content, a verifier proves only that the file is consistent with whatever key it carries, which a forger can generate.

**Other manufacturers.** No manufacturer documentation of a G-record scheme was found for any of the eight. A reimplementation would need each manufacturer's cooperation and still would not count as IGC validation.

## Comparison

Costs are per month on top of the #34 stack. An active month assumes up to 3,000 files.

| Option | Idle month | Active month | Latency per file | Operations | DLL updates | Constraint on the backend |
| --- | --- | --- | --- | --- | --- | --- |
| Wine next to the backend | about $0.12 to $0.21 extra root filesystem | a few cents extra | DLL time plus about 1 s for the first file | One image, one deploy | Rebuild and deploy the backend | x86_64 with 32-bit kernel support, image of about 1 GB |
| Separate Wine worker on Fly.io | about $0.12 to $0.21 | a few cents | plus about 2 s worker cold start | Second app and a private call with retries | Deploy the worker only | None, worker needs x86_64 |
| Azure Functions Windows Consumption | a few cents for storage (**unverified**) | $0 compute within the free grant | Windows cold start, not measured | Second cloud, Windows build, legacy plan | Deploy the function app | None, but Win32k sandbox may break DLLs |
| FAI CIVL server | $0 | $0 | Unknown, server unreachable | None while it works | CIVL's schedule | Covers LXV, NAV and FLA only |
| Native Rust | $0 | $0 | Milliseconds | Reverse engineering per manufacturer | Not applicable | Not IGC validation, keys are not public |

## Isolation of a crashing or hanging DLL

Whatever host runs the DLLs, each validation needs its own process with a hard timeout, for example 30 s against LXV's 5.5 s under emulation, after which the process group and `wineserver` are killed. A timeout or crash is stored as a validation error that the analysis log reports, distinct from a file that fails validation, and is not retried automatically. One file at a time per Wine prefix avoids interference between DLLs. A read-only prefix baked into the image, with the IGC file copied to a temporary directory, keeps one run from leaving state for the next. The EWA DLL that hung in #27 is out of the MVP, but a timeout is still the only guard against a DLL that shows a message box without a display.

## Options for the grilling

These are options with tradeoffs, not a decision.

1. **Wine in the backend image.** One container on Fly.io, about $0.12 to $0.21 more per idle month and no new service. The backend stays tied to x86_64 with 32-bit kernel support, the image grows to about 1 GB, and untrusted files reach a DLL in the Machine that holds the database volume.
2. **A separate Wine worker on Fly.io.** The same cost with a second app, a second cold start for the first file, and a network call with retries. The DLLs are isolated from the database, update independently, and the backend keeps a small image on any host.
3. **Azure Functions on Windows.** Native Windows at about $0 compute, but the plan is legacy, the sandbox blocks User32, and it adds a second cloud and US operator. Only worth testing if Wine fails on Fly.io's kernel.
4. **Defer validation.** Store files with a "not checked" warning for every manufacturer until one of the above is proven on a real x86_64 host. This keeps the MVP free of Wine but loses the integrity check that #27 established.

Both Wine options need the same choice between an old-WoW64 image with i386 multiarch, which #27 proved under emulation, and a new-WoW64 image such as Arch's Wine 11, which is smaller but unproven for these DLLs.

## Open questions

- Do the eight DLLs validate in new WoW64 mode, for example with Arch's Wine 11, on a real x86_64 host? A GitHub Actions run with the #27 harness and sample files answers this.
- Does Fly.io's current kernel run 32-bit x86 code, in either WoW64 mode? A test Machine running a static i386 binary answers this.
- How fast is LXV on native x86_64 compared with 5.5 s under emulation?
- How large is an amd64 image with `wine32:i386`, and how long is a cold start of a 1 GB image on Fly.io after a deploy?
- Do the current DLLs from the FAI page, which differ from the 2021 copies used here, still import the same functions and behave the same?
- Does any validator call User32 in quiet mode, which matters for the Azure sandbox and for a headless Wine without a display driver?
- Can the IGC or GFAC confirm that running the DLLs on a server for a scoring service is within their terms, and that a private container image bundling them is acceptable?
- Who downloads new DLL versions, and how does Keyhole learn that one was published, given that the FAI site blocks automated access and the GFAC mirror is gone?
