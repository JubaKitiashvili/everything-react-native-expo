#!/usr/bin/env node

/**
 * ERNE Video Frame Extractor
 *
 * Extracts key frames from a video using scene change detection.
 * Used by /debug-video command for video-based visual debugging.
 *
 * Usage:
 *   node scripts/extract-video-frames.js <video-path> [--max-frames 20] [--output-dir /tmp/frames]
 *
 * Outputs JSON to stdout:
 *   { "frames": ["frame_001.png", ...], "count": 12, "duration": 8.5, "outputDir": "/tmp/..." }
 *
 * ffmpeg resolution order:
 *   1. System ffmpeg (brew/apt/choco)
 *   2. ffmpeg-static npm package
 *   3. Error with install instructions
 */

const { execSync, spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const videoPath = args.find((a) => !a.startsWith('--'));
const maxFrames = parseInt(args[args.indexOf('--max-frames') + 1] || '20', 10);
const outputDir =
  args[args.indexOf('--output-dir') + 1] || path.join(os.tmpdir(), `erne-frames-${Date.now()}`);

if (!videoPath) {
  process.stderr.write(
    JSON.stringify({
      error: 'No video path provided',
      usage: 'node scripts/extract-video-frames.js <video-path> [--max-frames 20]',
    }) + '\n',
  );
  process.exit(1);
}

if (!existsSync(videoPath)) {
  process.stderr.write(JSON.stringify({ error: `Video file not found: ${videoPath}` }) + '\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Find ffmpeg
// ---------------------------------------------------------------------------

function findFfmpeg() {
  // 1. System ffmpeg
  try {
    const result = spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' });
    if (result.status === 0) return 'ffmpeg';
  } catch {
    // not found
  }

  // 2. ffmpeg-static npm package
  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  } catch {
    // not installed
  }

  // 3. Check common paths
  const commonPaths = ['/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/bin/ffmpeg'];
  for (const p of commonPaths) {
    if (existsSync(p)) return p;
  }

  return null;
}

function findFfprobe() {
  try {
    const result = spawnSync('ffprobe', ['-version'], { stdio: 'pipe' });
    if (result.status === 0) return 'ffprobe';
  } catch {
    // not found
  }

  try {
    const ffprobeStatic = require('ffprobe-static');
    if (ffprobeStatic?.path && existsSync(ffprobeStatic.path)) return ffprobeStatic.path;
  } catch {
    // not installed
  }

  const commonPaths = ['/usr/local/bin/ffprobe', '/opt/homebrew/bin/ffprobe', '/usr/bin/ffprobe'];
  for (const p of commonPaths) {
    if (existsSync(p)) return p;
  }
  return null;
}

const ffmpeg = findFfmpeg();
const ffprobe = findFfprobe();

if (!ffmpeg) {
  process.stderr.write(
    JSON.stringify({
      error: 'ffmpeg not found',
      install: {
        macOS: 'brew install ffmpeg',
        ubuntu: 'sudo apt install ffmpeg',
        windows: 'choco install ffmpeg',
        npm: 'npm install ffmpeg-static (in project)',
      },
    }) + '\n',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Get video duration
// ---------------------------------------------------------------------------

function getVideoDuration() {
  if (!ffprobe) return null;
  try {
    const result = execSync(
      `"${ffprobe}" -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      { encoding: 'utf-8' },
    );
    return parseFloat(result.trim());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Extract frames
// ---------------------------------------------------------------------------

mkdirSync(outputDir, { recursive: true });

const duration = getVideoDuration();

// Determine scene change threshold based on expected frame count
// Lower threshold = more frames, higher = fewer frames
// Start with 0.3, adjust if we get too many/few frames
const thresholds = [0.3, 0.2, 0.15, 0.4, 0.5];

let extractedFrames = [];

for (const threshold of thresholds) {
  // Clean previous attempt
  for (const f of readdirSync(outputDir)) {
    if (f.startsWith('frame_')) {
      require('node:fs').unlinkSync(path.join(outputDir, f));
    }
  }

  try {
    execSync(
      `"${ffmpeg}" -i "${videoPath}" -vf "select=gt(scene\\,${threshold})" -vsync vfn "${path.join(outputDir, 'frame_%03d.png')}" -y 2>/dev/null`,
      { stdio: 'pipe', timeout: 30000 },
    );
  } catch {
    // ffmpeg may return non-zero but still extract frames
  }

  extractedFrames = readdirSync(outputDir)
    .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
    .sort();

  // Also always extract first and last frame if not captured
  if (extractedFrames.length === 0) {
    try {
      execSync(
        `"${ffmpeg}" -i "${videoPath}" -vf "select=eq(n\\,0)" -vframes 1 "${path.join(outputDir, 'frame_000.png')}" -y 2>/dev/null`,
        { stdio: 'pipe', timeout: 10000 },
      );
    } catch {
      // ignore
    }
    extractedFrames = readdirSync(outputDir)
      .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
      .sort();
  }

  if (extractedFrames.length >= 2 && extractedFrames.length <= maxFrames) {
    break; // good range
  }

  if (extractedFrames.length > maxFrames) {
    // Too many — pick evenly spaced subset
    const step = Math.ceil(extractedFrames.length / maxFrames);
    const selected = extractedFrames.filter((_, i) => i % step === 0).slice(0, maxFrames);

    // Remove unselected frames
    for (const f of extractedFrames) {
      if (!selected.includes(f)) {
        try {
          require('node:fs').unlinkSync(path.join(outputDir, f));
        } catch {
          // ignore
        }
      }
    }
    extractedFrames = selected;
    break;
  }
}

// Ensure we have at least the first frame
if (extractedFrames.length === 0) {
  try {
    execSync(
      `"${ffmpeg}" -i "${videoPath}" -vframes 1 "${path.join(outputDir, 'frame_001.png')}" -y 2>/dev/null`,
      { stdio: 'pipe', timeout: 10000 },
    );
    extractedFrames = ['frame_001.png'];
  } catch {
    process.stderr.write(
      JSON.stringify({ error: 'Failed to extract any frames from video' }) + '\n',
    );
    process.exit(1);
  }
}

// Get file sizes for info
const totalSize = extractedFrames.reduce((sum, f) => {
  try {
    return sum + statSync(path.join(outputDir, f)).size;
  } catch {
    return sum;
  }
}, 0);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const result = {
  frames: extractedFrames.map((f) => path.join(outputDir, f)),
  count: extractedFrames.length,
  duration: duration || null,
  totalSizeBytes: totalSize,
  totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
  outputDir,
  videoPath: path.resolve(videoPath),
  maxFrames,
};

// Duration warnings
if (duration) {
  if (duration > 60) {
    result.warning =
      'Video is over 60 seconds. Consider trimming to the relevant section for better analysis.';
  } else if (duration > 30) {
    result.note = 'Long video — only key moments extracted.';
  }
}

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
