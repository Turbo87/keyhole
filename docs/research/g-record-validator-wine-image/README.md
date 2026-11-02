# Wine image candidates for the G-record validators

Test kit for [#54](https://github.com/Turbo87/keyhole/issues/54). Findings are in [`../g-record-validator-wine-image.md`](../g-record-validator-wine-image.md).

The build context needs `dll-2021/` and `dll-2026/` with the eight validator DLLs and `igc/` with sample files written by `pick.py` from the [#44 test kit](https://github.com/Turbo87/keyhole/tree/research/g-record-validator-fly-test/docs/research/g-record-validator-fly-test). None of these are committed.

Each candidate is a target in `Dockerfile`, built on Fly's remote builder with `fly deploy --build-only --push --remote-only --build-target <target> --image-label <target>`. `run.sh` validates every sample with both DLL sets, one Wine process per file. `vali.c` reports the result as its exit code, because the current FLA DLL prints to stdout, and replaces every `Sleep` import of the loaded DLL with a no-op.
