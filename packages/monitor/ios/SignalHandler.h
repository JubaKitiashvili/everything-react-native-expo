#ifndef ERNE_MONITOR_SIGNAL_HANDLER_H
#define ERNE_MONITOR_SIGNAL_HANDLER_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 Pre-allocated buffer size used by the async-signal-safe writer. Must be
 large enough to hold the longest crash report we might emit but small
 enough that the kernel guarantees a single write() will not be split.
 */
#define ERNE_CRASH_BUFFER_BYTES (64 * 1024)

/**
 Install POSIX signal handlers for SIGSEGV, SIGABRT, SIGBUS, SIGFPE,
 SIGILL, SIGTRAP. Previous handlers are saved and chained — the SDK
 never swallows another crash reporter (Sentry, Firebase, Bugsnag).

 The crash report is written synchronously to `path` before the
 process is allowed to die. `path` is copied into a static buffer
 owned by the C layer, so the caller does not need to keep it alive.

 Returns 0 on success, -1 on failure (path too long or sigaction
 refused — see errno).
 */
int erne_install_signal_handler(const char *path);

/**
 Uninstall the handler and restore whatever was registered before.
 Idempotent — calling without a prior install is a no-op.
 */
void erne_uninstall_signal_handler(void);

/**
 Returns 1 if the signal handler is currently installed.
 */
int erne_is_signal_handler_installed(void);

#ifdef __cplusplus
}
#endif

#endif /* ERNE_MONITOR_SIGNAL_HANDLER_H */
