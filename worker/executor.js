'use strict';

const { spawn } = require('child_process');

const OUTPUT_BUFFER_LIMIT = 5000;

/**
 * Execute a claude code command with the given prompt.
 */
function executeClaudeCode(prompt, cwd, executorConfig, logger) {
  const timeout = (executorConfig && executorConfig.timeout_seconds || 600) * 1000;

  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;

    const args = ['--print', '--dangerously-skip-permissions', '-p', prompt];

    if (logger) logger.info(`Spawning claude in ${cwd}`);
    if (logger) logger.debug(`Timeout: ${timeout / 1000}s`);

    let proc;
    try {
      proc = spawn('claude', args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      if (logger) logger.error(`Failed to spawn claude: ${err.message}`);
      resolve({ success: false, output: '', timedOut: false, exitCode: -1, error: err.message });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      if (logger) logger.warn('Execution timed out, sending SIGTERM');
      proc.kill('SIGTERM');
    }, timeout);

    function appendOutput(chunk) {
      const text = chunk.toString();
      output += text;
      // Keep only last N chars
      if (output.length > OUTPUT_BUFFER_LIMIT) {
        output = output.slice(output.length - OUTPUT_BUFFER_LIMIT);
      }
    }

    // Stream stdout line by line
    let stdoutRemainder = '';
    proc.stdout.on('data', (chunk) => {
      appendOutput(chunk);
      const text = stdoutRemainder + chunk.toString();
      const lines = text.split('\n');
      stdoutRemainder = lines.pop();
      for (const line of lines) {
        if (line && logger) logger.debug(`[stdout] ${line}`);
      }
    });

    // Stream stderr line by line
    let stderrRemainder = '';
    proc.stderr.on('data', (chunk) => {
      appendOutput(chunk);
      const text = stderrRemainder + chunk.toString();
      const lines = text.split('\n');
      stderrRemainder = lines.pop();
      for (const line of lines) {
        if (line && logger) logger.warn(`[stderr] ${line}`);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (logger) logger.error(`Process error: ${err.message}`);
      resolve({ success: false, output, timedOut: false, exitCode: -1, error: err.message });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      // Flush remainder
      if (stdoutRemainder && logger) logger.debug(`[stdout] ${stdoutRemainder}`);
      if (stderrRemainder && logger) logger.warn(`[stderr] ${stderrRemainder}`);

      if (logger) logger.info(`Claude exited with code ${code}${timedOut ? ' (timed out)' : ''}`);

      resolve({
        success: code === 0 && !timedOut,
        output,
        timedOut,
        exitCode: code,
      });
    });
  });
}

module.exports = { executeClaudeCode };
