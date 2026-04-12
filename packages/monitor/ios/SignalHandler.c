/*
 * SignalHandler.c — async-signal-safe POSIX signal handler for
 * @erne/monitor on iOS.
 *
 * Why C and not Swift?
 *   Swift's runtime is not async-signal-safe. The Swift compiler
 *   inserts retain/release calls and metadata accesses that can
 *   acquire locks held by the crashed thread. C with no allocations,
 *   no locks, and no Foundation calls is the only safe option.
 *
 * Async-signal-safety rules followed here:
 *   1. NO malloc / free / strdup / sprintf / printf / NSLog.
 *   2. NO Foundation, Swift, or Objective-C runtime calls.
 *   3. NO locking primitives (pthread_mutex, dispatch_*).
 *   4. ONLY the POSIX functions explicitly marked async-signal-safe
 *      in `man signal-safety` are allowed inside the handler:
 *      sigaction, sigaddset, signal, raise, _exit, write, open, close,
 *      lseek, fsync, getpid, gettid, time, memcpy, memset, strlen.
 *   5. backtrace() / backtrace_symbols() are NOT formally
 *      async-signal-safe but are widely used by every iOS crash
 *      reporter (Crashlytics, Sentry, KSCrash) and have proven
 *      reliable. We capture the raw addresses with backtrace() inside
 *      the handler and resolve symbols on the next launch from JS,
 *      so the handler itself only does the cheap pointer walk.
 *   6. Pre-allocate every buffer at install time so the handler
 *      never touches the heap.
 */

#include "SignalHandler.h"

#include <errno.h>
#include <execinfo.h>
#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/types.h>
#include <sys/uio.h>
#include <time.h>
#include <unistd.h>

#define ERNE_PATH_MAX 1024
#define ERNE_BACKTRACE_DEPTH 64
#define ERNE_HANDLED_SIGNAL_COUNT 6

static const int erne_handled_signals[ERNE_HANDLED_SIGNAL_COUNT] = {
    SIGSEGV, SIGABRT, SIGBUS, SIGFPE, SIGILL, SIGTRAP};

static char erne_crash_path[ERNE_PATH_MAX] = {0};
static char erne_buffer[ERNE_CRASH_BUFFER_BYTES] = {0};
static void *erne_backtrace_frames[ERNE_BACKTRACE_DEPTH] = {0};
static struct sigaction erne_previous_actions[ERNE_HANDLED_SIGNAL_COUNT] = {0};
static volatile sig_atomic_t erne_installed = 0;
static volatile sig_atomic_t erne_in_handler = 0;

/* ---- async-signal-safe utility helpers ---- */

static size_t erne_safe_strlen(const char *s) {
  size_t n = 0;
  while (s[n] != '\0' && n < ERNE_CRASH_BUFFER_BYTES) n++;
  return n;
}

static size_t erne_safe_uitoa(uintptr_t value, char *out, size_t out_size) {
  /* Hex representation, no leading "0x" — appended by caller. */
  static const char hex_digits[] = "0123456789abcdef";
  char tmp[2 * sizeof(uintptr_t) + 1];
  size_t n = 0;
  if (value == 0) {
    if (out_size >= 2) {
      out[0] = '0';
      out[1] = '\0';
    }
    return 1;
  }
  while (value > 0 && n < sizeof(tmp)) {
    tmp[n++] = hex_digits[value & 0xf];
    value >>= 4;
  }
  size_t written = 0;
  for (size_t i = 0; i < n && written + 1 < out_size; i++) {
    out[written++] = tmp[n - 1 - i];
  }
  if (written < out_size) out[written] = '\0';
  return written;
}

static size_t erne_safe_itoa(int value, char *out, size_t out_size) {
  if (value == 0) {
    if (out_size >= 2) {
      out[0] = '0';
      out[1] = '\0';
    }
    return 1;
  }
  int negative = value < 0;
  unsigned int v = (unsigned int)(negative ? -value : value);
  char tmp[16];
  size_t n = 0;
  while (v > 0 && n < sizeof(tmp)) {
    tmp[n++] = (char)('0' + (v % 10));
    v /= 10;
  }
  size_t written = 0;
  if (negative && written + 1 < out_size) out[written++] = '-';
  for (size_t i = 0; i < n && written + 1 < out_size; i++) {
    out[written++] = tmp[n - 1 - i];
  }
  if (written < out_size) out[written] = '\0';
  return written;
}

static size_t erne_append(char *dst, size_t dst_len, size_t dst_cap,
                          const char *src) {
  size_t i = 0;
  while (src[i] != '\0' && dst_len + i + 1 < dst_cap) {
    dst[dst_len + i] = src[i];
    i++;
  }
  if (dst_len + i < dst_cap) dst[dst_len + i] = '\0';
  return dst_len + i;
}

/* ---- the handler ---- */

static void erne_signal_handler(int sig, siginfo_t *info, void *context) {
  /* Re-entrancy guard — if a second crash fires while we're writing,
     hand control straight to the previous handler chain. */
  if (erne_in_handler) {
    for (int i = 0; i < ERNE_HANDLED_SIGNAL_COUNT; i++) {
      if (erne_handled_signals[i] == sig) {
        struct sigaction *prev = &erne_previous_actions[i];
        if ((prev->sa_flags & SA_SIGINFO) != 0 && prev->sa_sigaction != NULL) {
          prev->sa_sigaction(sig, info, context);
        } else if (prev->sa_handler != SIG_DFL && prev->sa_handler != SIG_IGN) {
          prev->sa_handler(sig);
        }
        break;
      }
    }
    raise(sig);
    return;
  }
  erne_in_handler = 1;

  /* Capture backtrace into the pre-allocated frame array. */
  int frame_count =
      backtrace(erne_backtrace_frames, ERNE_BACKTRACE_DEPTH);
  if (frame_count < 0) frame_count = 0;

  /* Build the report inside our pre-allocated buffer. The format is a
     simple line-oriented text protocol the Swift side parses on next
     launch — no JSON encoder is async-signal-safe. */
  size_t len = 0;
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), "ERNE_CRASH 1\n");
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), "signal=");
  char num[32];
  erne_safe_itoa(sig, num, sizeof(num));
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), num);
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), "\ncode=");
  if (info != NULL) {
    erne_safe_itoa(info->si_code, num, sizeof(num));
    len = erne_append(erne_buffer, len, sizeof(erne_buffer), num);
  } else {
    len = erne_append(erne_buffer, len, sizeof(erne_buffer), "0");
  }
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), "\nfault=0x");
  if (info != NULL) {
    char addr[2 * sizeof(uintptr_t) + 1];
    erne_safe_uitoa((uintptr_t)info->si_addr, addr, sizeof(addr));
    len = erne_append(erne_buffer, len, sizeof(erne_buffer), addr);
  } else {
    len = erne_append(erne_buffer, len, sizeof(erne_buffer), "0");
  }
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), "\npid=");
  erne_safe_itoa((int)getpid(), num, sizeof(num));
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), num);
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), "\ntime=");
  erne_safe_itoa((int)time(NULL), num, sizeof(num));
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), num);
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), "\nframes=");
  erne_safe_itoa(frame_count, num, sizeof(num));
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), num);
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), "\n");

  for (int i = 0; i < frame_count; i++) {
    len = erne_append(erne_buffer, len, sizeof(erne_buffer), "f=0x");
    char addr[2 * sizeof(uintptr_t) + 1];
    erne_safe_uitoa((uintptr_t)erne_backtrace_frames[i], addr, sizeof(addr));
    len = erne_append(erne_buffer, len, sizeof(erne_buffer), addr);
    len = erne_append(erne_buffer, len, sizeof(erne_buffer), "\n");
  }
  len = erne_append(erne_buffer, len, sizeof(erne_buffer), "ERNE_END\n");

  /* Open the file with O_CREAT|O_WRONLY|O_TRUNC and write the buffer
     in one shot. write() is async-signal-safe. */
  if (erne_crash_path[0] != '\0') {
    int fd = open(erne_crash_path, O_CREAT | O_WRONLY | O_TRUNC, 0644);
    if (fd >= 0) {
      ssize_t written = 0;
      while ((size_t)written < len) {
        ssize_t n = write(fd, erne_buffer + written, len - (size_t)written);
        if (n <= 0) {
          if (errno == EINTR) continue;
          break;
        }
        written += n;
      }
      fsync(fd);
      close(fd);
    }
  }

  /* Chain to the previous handler so other crash reporters still see
     the signal — then re-raise to let the kernel kill us. */
  for (int i = 0; i < ERNE_HANDLED_SIGNAL_COUNT; i++) {
    if (erne_handled_signals[i] == sig) {
      struct sigaction *prev = &erne_previous_actions[i];
      if ((prev->sa_flags & SA_SIGINFO) != 0 && prev->sa_sigaction != NULL) {
        prev->sa_sigaction(sig, info, context);
      } else if (prev->sa_handler != SIG_DFL && prev->sa_handler != SIG_IGN) {
        prev->sa_handler(sig);
      }
      break;
    }
  }

  /* Restore default disposition and re-raise to kill the process. */
  signal(sig, SIG_DFL);
  raise(sig);
}

/* ---- public API ---- */

int erne_install_signal_handler(const char *path) {
  if (erne_installed) return 0;
  if (path == NULL) return -1;
  size_t path_len = strlen(path);
  if (path_len + 1 > ERNE_PATH_MAX) return -1;

  memset(erne_crash_path, 0, sizeof(erne_crash_path));
  memcpy(erne_crash_path, path, path_len);
  erne_crash_path[path_len] = '\0';

  struct sigaction new_action;
  memset(&new_action, 0, sizeof(new_action));
  new_action.sa_sigaction = erne_signal_handler;
  new_action.sa_flags = SA_SIGINFO | SA_ONSTACK;
  sigemptyset(&new_action.sa_mask);
  for (int i = 0; i < ERNE_HANDLED_SIGNAL_COUNT; i++) {
    sigaddset(&new_action.sa_mask, erne_handled_signals[i]);
  }

  for (int i = 0; i < ERNE_HANDLED_SIGNAL_COUNT; i++) {
    if (sigaction(erne_handled_signals[i], &new_action,
                  &erne_previous_actions[i]) != 0) {
      /* Roll back any handlers we already installed. */
      for (int j = 0; j < i; j++) {
        sigaction(erne_handled_signals[j], &erne_previous_actions[j], NULL);
      }
      memset(erne_crash_path, 0, sizeof(erne_crash_path));
      return -1;
    }
  }

  erne_installed = 1;
  return 0;
}

void erne_uninstall_signal_handler(void) {
  if (!erne_installed) return;
  for (int i = 0; i < ERNE_HANDLED_SIGNAL_COUNT; i++) {
    sigaction(erne_handled_signals[i], &erne_previous_actions[i], NULL);
  }
  memset(erne_crash_path, 0, sizeof(erne_crash_path));
  erne_installed = 0;
}

int erne_is_signal_handler_installed(void) { return erne_installed ? 1 : 0; }
