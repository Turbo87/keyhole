#include <windows.h>
#include <stdio.h>

typedef DWORD (__cdecl *IdentifyFn)(char *, DWORD);
typedef void (__cdecl *InitFn)(HWND, BOOL);
typedef BOOL (__cdecl *ValidateFn)(const char *);

int main(int argc, char **argv) {
    if (argc < 3) {
        fprintf(stderr, "usage: vali <dll> <igc-file>...\n");
        return 2;
    }
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
    HMODULE dll = LoadLibraryA(argv[1]);
    if (!dll) {
        fprintf(stderr, "LoadLibrary failed: %lu\n", GetLastError());
        return 2;
    }
    IdentifyFn identify = (IdentifyFn)GetProcAddress(dll, "IdentifyDLL");
    InitFn init = (InitFn)GetProcAddress(dll, "InitializeDLL");
    ValidateFn validate = (ValidateFn)GetProcAddress(dll, "ValidateLog");
    if (!init || !validate) {
        fprintf(stderr, "missing exports\n");
        return 2;
    }
    if (identify) {
        char id[256] = {0};
        identify(id, sizeof id);
        printf("DLL\t%s\n", id);
    }
    init(NULL, TRUE);
    for (int i = 2; i < argc; i++) {
        BOOL ok = validate(argv[i]);
        printf("%s\t%s\n", ok ? "PASS" : "FAIL", argv[i]);
        fflush(stdout);
    }
    return 0;
}
