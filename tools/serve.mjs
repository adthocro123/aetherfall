#!/usr/bin/env node
// Aetherfall dev server. No dependencies.
//   npm start        -> http://localhost:8080 (this computer only)
//   npm run vr       -> also serves https://<your-LAN-IP>:8443 so a VR headset on the same Wi-Fi can open it.
//                       WebXR needs HTTPS, so a self-signed certificate is made once in tools/.cert/.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAN = process.argv.includes('--lan');
const PORT = Number(process.env.PORT || 8080);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 8443);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8',
};

function handler(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (url.endsWith('/')) url += 'index.html';
  const file = path.normalize(path.join(ROOT, url));
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some(p => p.startsWith('.') || p === 'node_modules')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer(handler).listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Aetherfall is running:  http://localhost:${PORT}\n`);
});

if (LAN) {
  const dir = path.join(ROOT, 'tools', '.cert');
  const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem');
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    fs.mkdirSync(dir, { recursive: true });
    try {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '825', '-subj', '/CN=aetherfall.local'], { stdio: 'ignore' });
    } catch {
      console.error('  Could not create a certificate. Install openssl, or play on this computer with `npm start`.');
      process.exit(1);
    }
  }
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, handler).listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log('  For a VR headset on the same Wi-Fi, open one of these in its browser:');
    for (const ip of ips) console.log(`    https://${ip}:${HTTPS_PORT}`);
    console.log('  The browser warns about the certificate once; choose Advanced, then Proceed.\n');
  });
}
