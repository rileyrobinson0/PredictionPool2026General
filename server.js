const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'predictions.json');
const RACES = [
  { id: 'senate-mi', label: 'Michigan', office: 'U.S. Senate', state: 'MI' },
  { id: 'senate-tx', label: 'Texas', office: 'U.S. Senate', state: 'TX' },
  { id: 'senate-ia', label: 'Iowa', office: 'U.S. Senate', state: 'IA' },
  { id: 'governor-wi', label: 'Wisconsin', office: 'Governor', state: 'WI' },
  { id: 'governor-oh', label: 'Ohio', office: 'Governor', state: 'OH' },
  { id: 'governor-ga', label: 'Georgia', office: 'Governor', state: 'GA' },
];

let writeQueue = Promise.resolve();

async function readPredictions() {
  try {
    const contents = await fs.readFile(DATA_FILE, 'utf8');
    const records = JSON.parse(contents);
    return Array.isArray(records) ? records : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendPrediction(record) {
  writeQueue = writeQueue.then(async () => {
    const records = await readPredictions();
    records.push(record);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const temporaryFile = `${DATA_FILE}.tmp`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryFile, DATA_FILE);
  });
  return writeQueue;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request is too large.');
  }
  return JSON.parse(body);
}

function isValidSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 60) return false;
  if (!body.predictions || typeof body.predictions !== 'object' || Array.isArray(body.predictions)) return false;
  return RACES.every(({ id }) => {
    const value = body.predictions[id];
    return typeof value === 'number' && Number.isFinite(value) && value >= -100 && value <= 100;
  });
}

async function serveStatic(request, response, pathname) {
  const routes = {
    '/': ['public/index.html', 'text/html; charset=utf-8'],
    '/results': ['public/index.html', 'text/html; charset=utf-8'],
    '/styles.css': ['public/styles.css', 'text/css; charset=utf-8'],
    '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  };
  const route = routes[pathname];
  if (!route) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  try {
    const contents = await fs.readFile(path.join(ROOT, route[0]));
    response.writeHead(200, {
      'Content-Type': route[1],
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    response.end(contents);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Unable to load the page.');
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/api/races') {
    return sendJson(response, 200, { races: RACES });
  }
  if (request.method === 'GET' && url.pathname === '/api/predictions') {
    try {
      return sendJson(response, 200, { predictions: await readPredictions(), races: RACES });
    } catch {
      return sendJson(response, 500, { error: 'Could not load results right now.' });
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/predictions') {
    try {
      const body = await readJsonBody(request);
      if (!isValidSubmission(body)) {
        return sendJson(response, 400, { error: 'Enter your name and a margin from -100 to 100 for every race.' });
      }
      const record = {
        id: randomUUID(),
        name: body.name.trim(),
        predictions: Object.fromEntries(RACES.map(({ id }) => [id, Math.round(body.predictions[id] * 10) / 10])),
        submittedAt: new Date().toISOString(),
      };
      await appendPrediction(record);
      return sendJson(response, 201, { prediction: record });
    } catch (error) {
      const status = error instanceof SyntaxError || error.message === 'Request is too large.' ? 400 : 500;
      return sendJson(response, status, { error: status === 400 ? 'Please check your submission and try again.' : 'Could not save your prediction right now.' });
    }
  }
  if (request.method === 'GET') return serveStatic(request, response, url.pathname);
  response.writeHead(405, { Allow: 'GET, POST' });
  response.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Prediction Pool is running at http://localhost:${PORT}`);
});
