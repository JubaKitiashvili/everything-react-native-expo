import Foundation

/**
 Task 49 — Hermes CPU Profiler Bridge (iOS).

 Starts/stops the Hermes sampling profiler via the global JS runtime
 and exports .cpuprofile data. The bridge communicates with Hermes
 through the global `__jsi_hermesProfiler_start` / `__jsi_hermesProfiler_stop`
 runtime hooks that Hermes exposes when built with profiler support.

 Since direct Hermes C++ API access requires JSI, and we're in an Expo
 Module context, we use the JS-callable approach: the native module
 signals the JS layer to call `global.HermesInternal.enableSampling()`
 and `global.HermesInternal.disableSampling()` + collect the profile.

 The native side manages:
 - Profile file storage (Application Support/ErneMonitor/profiles/)
 - Duration cap (max 30 seconds)
 - File listing and cleanup
 */
final class HermesProfilerBridge {
    static let shared = HermesProfilerBridge()

    private let profileDir: URL
    private let maxDurationSec: TimeInterval = 30.0

    private init() {
        let support = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first!
        profileDir = support.appendingPathComponent("ErneMonitor/profiles", isDirectory: true)
        try? FileManager.default.createDirectory(at: profileDir, withIntermediateDirectories: true)
    }

    /// Save a .cpuprofile blob (received from JS after Hermes profiling stops).
    func saveProfile(data: String, trigger: String) -> String? {
        let filename = "profile-\(Int(Date().timeIntervalSince1970 * 1000))-\(trigger).cpuprofile"
        let fileURL = profileDir.appendingPathComponent(filename)
        do {
            try data.write(to: fileURL, atomically: true, encoding: .utf8)
            return fileURL.path
        } catch {
            return nil
        }
    }

    /// List stored profile files.
    func listProfiles() -> [[String: Any]] {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: profileDir,
            includingPropertiesForKeys: [.fileSizeKey, .creationDateKey]
        ) else { return [] }

        return files
            .filter { $0.pathExtension == "cpuprofile" }
            .compactMap { url in
                let values = try? url.resourceValues(forKeys: [.fileSizeKey, .creationDateKey])
                return [
                    "path": url.path,
                    "filename": url.lastPathComponent,
                    "sizeBytes": values?.fileSize ?? 0,
                    "createdAt": Int((values?.creationDate?.timeIntervalSince1970 ?? 0) * 1000),
                ] as [String: Any]
            }
            .sorted { ($0["createdAt"] as? Int ?? 0) > ($1["createdAt"] as? Int ?? 0) }
    }

    /// Delete a specific profile file.
    func deleteProfile(path: String) -> Bool {
        do {
            try FileManager.default.removeItem(atPath: path)
            return true
        } catch {
            return false
        }
    }

    /// Delete all stored profiles.
    func deleteAllProfiles() {
        let files = try? FileManager.default.contentsOfDirectory(at: profileDir, includingPropertiesForKeys: nil)
        for file in files ?? [] {
            try? FileManager.default.removeItem(at: file)
        }
    }

    var maxDurationMs: Int {
        return Int(maxDurationSec * 1000)
    }
}
