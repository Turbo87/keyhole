#include <windows.h>
#include <stdio.h>
#include <string.h>

typedef void (__cdecl *InitFn)(HWND, BOOL);
typedef BOOL (__cdecl *ValidateFn)(const char *);

static VOID WINAPI skip_sleep(DWORD ms) {
    (void)ms;
}

/* Replaces every import of kernel32 Sleep() with a no-op, without touching the DLL file. */
static int patch_sleep(HMODULE dll) {
    BYTE *base = (BYTE *)dll;
    IMAGE_NT_HEADERS *nt = (IMAGE_NT_HEADERS *)(base + ((IMAGE_DOS_HEADER *)base)->e_lfanew);
    IMAGE_DATA_DIRECTORY dir = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
    if (!dir.VirtualAddress) return 0;
    FARPROC sleep = GetProcAddress(GetModuleHandleA("kernel32.dll"), "Sleep");
    int patched = 0;
    for (IMAGE_IMPORT_DESCRIPTOR *imp = (IMAGE_IMPORT_DESCRIPTOR *)(base + dir.VirtualAddress); imp->Name; imp++) {
        for (IMAGE_THUNK_DATA *t = (IMAGE_THUNK_DATA *)(base + imp->FirstThunk); t->u1.Function; t++) {
            if ((FARPROC)t->u1.Function != sleep) continue;
            DWORD old;
            VirtualProtect(&t->u1.Function, sizeof t->u1.Function, PAGE_READWRITE, &old);
            t->u1.Function = (DWORD_PTR)skip_sleep;
            VirtualProtect(&t->u1.Function, sizeof t->u1.Function, old, &old);
            patched++;
        }
    }
    return patched;
}

/* Exit code 0 is a valid file, 1 an invalid file and 2 a harness error. The DLLs may print to stdout. */
int main(int argc, char **argv) {
    if (argc != 3) {
        fprintf(stderr, "usage: vali <dll> <igc-file>\n");
        return 2;
    }
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
    HMODULE dll = LoadLibraryA(argv[1]);
    if (!dll) {
        fprintf(stderr, "LoadLibrary failed: %lu\n", GetLastError());
        return 2;
    }
    InitFn init = (InitFn)GetProcAddress(dll, "InitializeDLL");
    ValidateFn validate = (ValidateFn)GetProcAddress(dll, "ValidateLog");
    if (!init || !validate) {
        fprintf(stderr, "missing exports\n");
        return 2;
    }
    fprintf(stderr, "SLEEP_PATCHED %d\n", patch_sleep(dll));
    init(NULL, TRUE);
    return validate(argv[2]) ? 0 : 1;
}
