package expo.modules.ernemonitor;

/**
 * JNI bridge to the C++ signal handler in
 * <code>android/src/main/cpp/signal_handler.cpp</code>.
 *
 * Loads the native library lazily on first reference. The Kotlin
 * {@link CrashHandler} owns lifecycle (install/uninstall) and the
 * persisted-crash drain — this class only exposes the raw JNI seam.
 */
public final class NativeCrashHandler {
  static {
    System.loadLibrary("erne_monitor");
  }

  private NativeCrashHandler() {
    /* no instances */
  }

  /**
   * Installs POSIX signal handlers (SIGSEGV, SIGABRT, SIGBUS, SIGFPE,
   * SIGILL, SIGTRAP) that write a line-oriented crash report to
   * <code>path</code> before chaining to the previous handlers.
   *
   * @param path absolute file path; created/truncated on each crash
   * @return 0 on success, -1 if installation failed
   */
  public static native int nativeInstall(String path);

  /**
   * Restores whatever signal handlers were registered before
   * {@link #nativeInstall(String)} was called. Idempotent.
   */
  public static native void nativeUninstall();

  /** Returns true if the native handler is currently installed. */
  public static native boolean nativeIsInstalled();
}
