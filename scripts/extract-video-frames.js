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
const maxFramesIdx = args.indexOf('--max-frames');
const maxFrames = parseInt(maxFramesIdx !== -1 ? args[maxFramesIdx + 1] : '20', 10);
const outputDirIdx = args.indexOf('--output-dir');
const outputDir =
  outputDirIdx !== -1
    ? args[outputDirIdx + 1]
    : path.join(os.tmpdir(), `erne-frames-${Date.now()}`);

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

// ---------------------------------------------------------------------------
// Frame extraction strategy:
// 1. Try scene change detection with adaptive threshold
// 2. If too few frames, fall back to interval-based extraction
// 3. If too many, pick evenly spaced subset
// Uses setpts filter for ffmpeg 8.x compatibility (vsync/fps_mode deprecated)
// ---------------------------------------------------------------------------

function cleanFrames() {
  for (const f of readdirSync(outputDir)) {
    if (f.startsWith('frame_')) {
      require('node:fs').unlinkSync(path.join(outputDir, f));
    }
  }
}

function countFrames() {
  return readdirSync(outputDir)
    .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
    .sort();
}

function runFfmpeg(filterExpr) {
  try {
    execSync(
      `"${ffmpeg}" -i "${videoPath}" -vf "${filterExpr}" "${path.join(outputDir, 'frame_%03d.png')}" -y 2>/dev/null`,
      { stdio: 'pipe', timeout: 60000 },
    );
  } catch {
    // ffmpeg may return non-zero but still extract frames
  }
}

let extractedFrames = [];

// Strategy 1: Scene change detection with adaptive threshold
const thresholds = [0.3, 0.2, 0.15, 0.1];

for (const threshold of thresholds) {
  cleanFrames();
  runFfmpeg(`select=gt(scene\\,${threshold}),setpts=N/FRAME_RATE/TB`);
  extractedFrames = countFrames();

  if (extractedFrames.length >= 3 && extractedFrames.length <= maxFrames) {
    break;
  }
  if (extractedFrames.length > maxFrames) {
    break; // will trim below
  }
}

// Strategy 2: If scene detection got < 3 frames, use interval-based extraction
if (extractedFrames.length < 3 && duration) {
  cleanFrames();
  // Extract ~maxFrames evenly spaced frames across the video
  const targetFrames = Math.min(maxFrames, Math.max(5, Math.ceil(duration * 2)));
  const interval = duration / targetFrames;
  runFfmpeg(`fps=1/${interval.toFixed(3)}`);
  extractedFrames = countFrames();
}

// Strategy 3: Still nothing? Extract one frame per second
if (extractedFrames.length < 2) {
  cleanFrames();
  runFfmpeg('fps=2');
  extractedFrames = countFrames();
}

// Trim to maxFrames if too many
if (extractedFrames.length > maxFrames) {
  const step = Math.ceil(extractedFrames.length / maxFrames);
  const selected = extractedFrames.filter((_, i) => i % step === 0).slice(0, maxFrames);

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
}

// Last resort: extract just the first frame
if (extractedFrames.length === 0) {
  try {
    execSync(
      `"${ffmpeg}" -i "${videoPath}" -frames:v 1 "${path.join(outputDir, 'frame_001.png')}" -y 2>/dev/null`,
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
