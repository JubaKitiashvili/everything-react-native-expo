'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ERNE_DIR = path.join(os.homedir(), '.erne');
const TASKS_FILE = path.join(ERNE_DIR, 'tasks.json');
const UPLOADS_DIR = path.join(ERNE_DIR, 'uploads');
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readTasks() {
  try {
    if (fs.existsSync(TASKS_FILE)) {
      return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    }
  } catch {}
  return { tasks: [] };
}

function writeTasks(data) {
  ensureDir(ERNE_DIR);
  const tmp = TASKS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, TASKS_FILE);
}

function handleTasks(req, res, urlPath, body, workerTasks) {
  // GET /api/tasks — list all (local + worker)
  if (req.method === 'GET' && urlPath === '/api/tasks') {
    const local = readTasks().tasks;
    const worker = workerTasks ? Array.from(workerTasks.values()) : [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tasks: [...local, ...worker] }));
    return true;
  }

  // POST /api/tasks — create local task
  if (req.method === 'POST' && urlPath === '/api/tasks') {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const task = {
        id: crypto.randomUUID(),
        title: parsed.title || 'Untitled',
        description: parsed.description || '',
        source: 'local',
        status: 'queue',
        photos: Array.isArray(parsed.photos) ? parsed.photos : [],
        createdAt: new Date().toISOString(),
        prUrl: null,
      };
      const data = readTasks();
      data.tasks.push(task);
      writeTasks(data);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(task));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  // PUT /api/tasks/:id — update local task
  if (req.method === 'PUT' && urlPath.startsWith('/api/tasks/') && !urlPath.includes('/upload')) {
    const id = urlPath.split('/').pop();
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const data = readTasks();
      const idx = data.tasks.findIndex((t) => t.id === id);
      if (idx === -1) {
        if (workerTasks && workerTasks.has(id)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Worker tasks cannot be modified from dashboard' }));
          return true;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Task not found' }));
        return true;
      }
      const allowed = ['title', 'description', 'status', 'photos', 'prUrl'];
      for (const key of allowed) {
        if (parsed[key] !== undefined) data.tasks[idx][key] = parsed[key];
      }
      writeTasks(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data.tasks[idx]));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  // DELETE /api/tasks/:id
  if (
    req.method === 'DELETE' &&
    urlPath.startsWith('/api/tasks/') &&
    !urlPath.includes('/upload')
  ) {
    const id = urlPath.split('/').pop();
    const data = readTasks();
    const idx = data.tasks.findIndex((t) => t.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Task not found' }));
      return true;
    }
    data.tasks.splice(idx, 1);
    writeTasks(data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  // GET /api/tasks/uploads/:file — serve uploaded photo
  if (req.method === 'GET' && urlPath.startsWith('/api/tasks/uploads/')) {
    const filename = path.basename(urlPath.split('/').pop());
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return true;
    }
    const ext = path.extname(filename).toLowerCase();
    const mimeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  return false;
}

// Multipart upload handler — called directly from server before parseBody
function handleUpload(req, res) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Expected multipart/form-data' }));
    return;
  }

  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/);
  if (!boundaryMatch) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing boundary' }));
    return;
  }

  ensureDir(UPLOADS_DIR);

  const chunks = [];
  let totalBytes = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    if (aborted) return;
    totalBytes += chunk.length;
    if (totalBytes > MAX_UPLOAD_SIZE) {
      aborted = true;
      req.destroy();
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File too large (max 5MB)' }));
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (aborted) return;
    try {
      const buffer = Buffer.concat(chunks);
      const boundary = boundaryMatch[1];

      // Simple multipart parser — extract first file part
      const boundaryBuf = Buffer.from('--' + boundary);
      const parts = [];
      let start = 0;

      while (true) {
        const idx = buffer.indexOf(boundaryBuf, start);
        if (idx === -1) break;
        if (start > 0) parts.push(buffer.slice(start, idx));
        start = idx + boundaryBuf.length;
        // Skip \r\n after boundary
        if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) start += 2;
      }

      if (parts.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No file found in upload' }));
        return;
      }

      const part = parts[0];
      // Find header/body separator (\r\n\r\n)
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed multipart data' }));
        return;
      }

      const headers = part.slice(0, headerEnd).toString();
      let fileBody = part.slice(headerEnd + 4);
      // Remove trailing \r\n before next boundary
      if (fileBody[fileBody.length - 2] === 0x0d && fileBody[fileBody.length - 1] === 0x0a) {
        fileBody = fileBody.slice(0, -2);
      }

      // Extract filename from Content-Disposition
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      const origName = filenameMatch ? filenameMatch[1] : 'upload';
      const ext = path.extname(origName).toLowerCase();

      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: `File type ${ext} not allowed. Use: ${ALLOWED_EXTENSIONS.join(', ')}`,
          }),
        );
        return;
      }

      const savedName = crypto.randomUUID() + ext;
      const savedPath = path.join(UPLOADS_DIR, savedName);
      fs.writeFileSync(savedPath, fileBody);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ filename: savedName, size: fileBody.length }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

module.exports = { handleTasks, handleUpload };
