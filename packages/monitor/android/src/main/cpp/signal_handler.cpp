/*
 * signal_handler.cpp — async-signal-safe POSIX crash handler for the
 * Android side of @erne/monitor.
 *
 * Mirrors the iOS SignalHandler.c byte-for-byte in semantics: identical
 * line-oriented text format on disk, identical signal set, identical
 * pre-allocated buffer rules, identical chaining of previous handlers.
 *
 * Why a single .cpp file? The Android NDK CMakeLists.txt picks this up
 * via add_library(erne_monitor SHARED ...) and exposes the JNI symbols
 * to the Java/Kotlin layer through extern "C" linkage. Keeping it
 * compact and free of C++ STL types means we can stay async-signal-safe
 * (no allocators, no exceptions, no virtual dispatch) while still
 * compiling cleanly under the C++17 NDK toolchain.
 *
 * The async-signal-safety rules are the same as the iOS file:
 *   1. NO malloc / free / new / delete.
 *   2. NO STL types — only plain C functions and POD arrays.
 *   3. NO Java VM calls inside the handler (the JVM is not signal-safe).
 *   4. ONLY POSIX functions explicitly listed in `man signal-safety`.
 *   5. backtrace()/backtrace_symbols() are not formally signal-safe but
 *      are widely used by every Android crash reporter; we capture raw
 *      addresses inside the handler and resolve symbols later from JS.
 */

#include <jni.h>

#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <string.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#include <unwind.h>

#define ERNE_PATH_MAX 1024
#define ERNE_BUFFER_BYTES (64 * 1024)
#define ERNE_BACKTRACE_DEPTH 64
#define ERNE_HANDLED_SIGNAL_COUNT 6

namespace {

const int kHandledSignals[ERNE_HANDLED_SIGNAL_COUNT] = {
    SIGSEGV, SIGABRT, SIGBUS, SIGFPE, SIGILL, SIGTRAP};

char g_crash_path[ERNE_PATH_MAX] = {0};
char g_buffer[ERNE_BUFFER_BYTES] = {0};
void *g_frames[ERNE_BACKTRACE_DEPTH] = {0};
struct sigaction g_previous[ERNE_HANDLED_SIGNAL_COUNT] = {0};
volatile sig_atomic_t g_installed = 0;
volatile sig_atomic_t g_in_handler = 0;

/* ---- async-signal-safe utility helpers ---- */

size_t safe_uitoa_hex(uintptr_t value, char *out, size_t out_size) {
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

size_t safe_itoa(int value, char *out, size_t out_size) {
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

size_t safe_append(char *dst, size_t dst_len, size_t dst_cap, const char *src) {
  size_t i = 0;
  while (src[i] != '\0' && dst_len + i + 1 < dst_cap) {
    dst[dst_len + i] = src[i];
    i++;
  }
  if (dst_len + i < dst_cap) dst[dst_len + i] = '\0';
  return dst_len + i;
}

/* ---- backtrace via libunwind (signal-safe enough on Android) ---- */

struct UnwindCtx {
  void **frames;
  int max;
  int count;
};

_Unwind_Reason_Code unwind_callback(struct _Unwind_Context *ctx, void *arg) {
  UnwindCtx *u = static_cast<UnwindCtx *>(arg);
  uintptr_t ip = _Unwind_GetIP(ctx);
  if (ip != 0 && u->count < u->max) {
    u->frames[u->count++] = reinterpret_cast<void *>(ip);
  }
  return _URC_NO_REASON;
}

int capture_backtrace(void **frames, int max) {
  UnwindCtx ctx{frames, max, 0};
  _Unwind_Backtrace(unwind_callback, &ctx);
  return ctx.count;
}

/* ---- the handler ---- */

void erne_signal_handler(int sig, siginfo_t *info, void *uctx) {
  if (g_in_handler) {
    for (int i = 0; i < ERNE_HANDLED_SIGNAL_COUNT; i++) {
      if (kHandledSignals[i] == sig) {
        struct sigaction *prev = &g_previous[i];
        if ((prev->sa_flags & SA_SIGINFO) != 0 && prev->sa_sigaction != nullptr) {
          prev->sa_sigaction(sig, info, uctx);
        } else if (prev->sa_handler != SIG_DFL && prev->sa_handler != SIG_IGN) {
          prev->sa_handler(sig);
        }
        break;
      }
    }
    raise(sig);
    return;
  }
  g_in_handler = 1;

  int frame_count = capture_backtrace(g_frames, ERNE_BACKTRACE_DEPTH);
  if (frame_count < 0) frame_count = 0;

  size_t len = 0;
  len = safe_append(g_buffer, len, sizeof(g_buffer), "ERNE_CRASH 1\n");
  len = safe_append(g_buffer, len, sizeof(g_buffer), "signal=");
  char num[32];
  safe_itoa(sig, num, sizeof(num));
  len = safe_append(g_buffer, len, sizeof(g_buffer), num);
  len = safe_append(g_buffer, len, sizeof(g_buffer), "\ncode=");
  if (info != nullptr) {
    safe_itoa(info->si_code, num, sizeof(num));
    len = safe_append(g_buffer, len, sizeof(g_buffer), num);
  } else {
    len = safe_append(g_buffer, len, sizeof(g_buffer), "0");
  }
  len = safe_append(g_buffer, len, sizeof(g_buffer), "\nfault=0x");
  if (info != nullptr) {
    char addr[2 * sizeof(uintptr_t) + 1];
    safe_uitoa_hex(reinterpret_cast<uintptr_t>(info->si_addr), addr,
                   sizeof(addr));
    len = safe_append(g_buffer, len, sizeof(g_buffer), addr);
  } else {
    len = safe_append(g_buffer, len, sizeof(g_buffer), "0");
  }
  len = safe_append(g_buffer, len, sizeof(g_buffer), "\npid=");
  safe_itoa((int)getpid(), num, sizeof(num));
  len = safe_append(g_buffer, len, sizeof(g_buffer), num);
  len = safe_append(g_buffer, len, sizeof(g_buffer), "\ntime=");
  safe_itoa((int)time(nullptr), num, sizeof(num));
  len = safe_append(g_buffer, len, sizeof(g_buffer), num);
  len = safe_append(g_buffer, len, sizeof(g_buffer), "\nframes=");
  safe_itoa(frame_count, num, sizeof(num));
  len = safe_append(g_buffer, len, sizeof(g_buffer), num);
  len = safe_append(g_buffer, len, sizeof(g_buffer), "\n");
  for (int i = 0; i < frame_count; i++) {
    len = safe_append(g_buffer, len, sizeof(g_buffer), "f=0x");
    char addr[2 * sizeof(uintptr_t) + 1];
    safe_uitoa_hex(reinterpret_cast<uintptr_t>(g_frames[i]), addr,
                   sizeof(addr));
    len = safe_append(g_buffer, len, sizeof(g_buffer), addr);
    len = safe_append(g_buffer, len, sizeof(g_buffer), "\n");
  }
  len = safe_append(g_buffer, len, sizeof(g_buffer), "ERNE_END\n");

  if (g_crash_path[0] != '\0') {
    int fd = open(g_crash_path, O_CREAT | O_WRONLY | O_TRUNC, 0644);
    if (fd >= 0) {
      ssize_t written = 0;
      while ((size_t)written < len) {
        ssize_t n = write(fd, g_buffer + written, len - (size_t)written);
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

  for (int i = 0; i < ERNE_HANDLED_SIGNAL_COUNT; i++) {
    if (kHandledSignals[i] == sig) {
      struct sigaction *prev = &g_previous[i];
      if ((prev->sa_flags & SA_SIGINFO) != 0 && prev->sa_sigaction != nullptr) {
        prev->sa_sigaction(sig, info, uctx);
      } else if (prev->sa_handler != SIG_DFL && prev->sa_handler != SIG_IGN) {
        prev->sa_handler(sig);
      }
      break;
    }
  }

  signal(sig, SIG_DFL);
  raise(sig);
}

}  // namespace

extern "C" {

JNIEXPORT jint JNICALL
Java_expo_modules_ernemonitor_NativeCrashHandler_nativeInstall(
    JNIEnv *env, jclass /*clazz*/, jstring path) {
  if (g_installed) return 0;
  if (path == nullptr) return -1;
  const char *cpath = env->GetStringUTFChars(path, nullptr);
  if (cpath == nullptr) return -1;
  size_t plen = strlen(cpath);
  if (plen + 1 > ERNE_PATH_MAX) {
    env->ReleaseStringUTFChars(path, cpath);
    return -1;
  }
  memset(g_crash_path, 0, sizeof(g_crash_path));
  memcpy(g_crash_path, cpath, plen);
  env->ReleaseStringUTFChars(path, cpath);

  struct sigaction action;
  memset(&action, 0, sizeof(action));
  action.sa_sigaction = erne_signal_handler;
  action.sa_flags = SA_SIGINFO | SA_ONSTACK;
  sigemptyset(&action.sa_mask);
  for (int i = 0; i < ERNE_HANDLED_SIGNAL_COUNT; i++) {
    sigaddset(&action.sa_mask, kHandledSignals[i]);
  }

  for (int i = 0; i < ERNE_HANDLED_SIGNAL_COUNT; i++) {
    if (sigaction(kHandledSignals[i], &action, &g_previous[i]) != 0) {
      for (int j = 0; j < i; j++) {
        sigaction(kHandledSignals[j], &g_previous[j], nullptr);
      }
      memset(g_crash_path, 0, sizeof(g_crash_path));
      return -1;
    }
  }

  g_installed = 1;
  return 0;
}

JNIEXPORT void JNICALL
Java_expo_modules_ernemonitor_NativeCrashHandler_nativeUninstall(
    JNIEnv * /*env*/, jclass /*clazz*/) {
  if (!g_installed) return;
  for (int i = 0; i < ERNE_HANDLED_SIGNAL_COUNT; i++) {
    sigaction(kHandledSignals[i], &g_previous[i], nullptr);
  }
  memset(g_crash_path, 0, sizeof(g_crash_path));
  g_installed = 0;
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_ernemonitor_NativeCrashHandler_nativeIsInstalled(
    JNIEnv * /*env*/, jclass /*clazz*/) {
  return g_installed ? JNI_TRUE : JNI_FALSE;
}

}  // extern "C"
