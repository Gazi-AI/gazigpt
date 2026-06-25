import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Disable TLS/SSL certificate validation errors in local development
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;

const PORT = 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Vercel Edge Runtime mock helper
async function runEdgeHandler(handlerModule, nodeReq, nodeRes) {
  const url = `http://${nodeReq.headers.host}${nodeReq.url}`;
  
  let body = null;
  if (nodeReq.method !== 'GET' && nodeReq.method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of nodeReq) {
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks);
  }

  const request = new Request(url, {
    method: nodeReq.method,
    headers: nodeReq.headers,
    body: body
  });

  try {
    const response = await handlerModule.default(request);

    nodeRes.statusCode = response.status;
    response.headers.forEach((value, key) => {
      nodeRes.setHeader(key, value);
    });

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        nodeRes.write(value);
      }
    }
    nodeRes.end();
  } catch (err) {
    console.error('Edge handler execution error:', err);
    nodeRes.statusCode = 500;
    nodeRes.setHeader('Content-Type', 'application/json');
    nodeRes.end(JSON.stringify({ error: err.message }));
  }
}

const server = http.createServer(async (req, res) => {
  console.log(`[${req.method}] ${req.url}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  if (req.url.startsWith('/api/')) {
    const urlPath = req.url.split('?')[0];
    let apiFilePath = path.join(rootDir, 'api', urlPath.slice(5) + '.js');
    
    if (urlPath === '/api/chat/stream') {
      apiFilePath = path.join(rootDir, 'api/chat/stream.js');
    }

    if (fs.existsSync(apiFilePath)) {
      try {
        const module = await import(`file://${apiFilePath}?t=${Date.now()}`);
        await runEdgeHandler(module, req, res);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load api route: ' + err.message }));
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `API route not found: ${urlPath}` }));
    }
    return;
  }

  let staticPath = req.url.split('?')[0];
  if (staticPath === '/') {
    staticPath = '/index.html';
  }

  const filePath = path.join(rootDir, 'public', staticPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`File not found: ${staticPath}`);
  }
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(` GaziGPT Dev Server started at http://localhost:${PORT}`);
  console.log(` Mode: Vercel Edge Runtime Emulation`);
  console.log(` Press Ctrl+C to stop`);
  console.log(`==================================================\n`);
});
