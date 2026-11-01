# G-record validators on Fly.io

Test kit for [#44](https://github.com/Turbo87/keyhole/issues/44). Results are in the issue's resolution comment.

The build context needs `dll-2021/` and `dll-2026/` with the eight validator DLLs and `igc/` with sample files written by `pick.py <soaringspot-download> igc`. None of these are committed.

`run.sh` validates every sample with both DLL sets, one Wine process per file. `slim.sh` times LXV with and without a persistent `wineserver` and checks one valid and one tampered file per current DLL.
