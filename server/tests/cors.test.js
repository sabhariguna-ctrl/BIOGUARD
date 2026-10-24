import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'node:http';
import { allowedOrigins } from '../src/config.js';

test('CLIENT_URL tolerates trailing slashes, spaces and several origins', () => {
  process.env.CLIENT_URL = ' https://bioguard.vercel.app/ , http://localhost:5173// ';
  assert.deepEqual(allowedOrigins(), ['https://bioguard.vercel.app', 'http://localhost:5173']);
  delete process.env.CLIENT_URL;
  assert.deepEqual(allowedOrigins(), ['http://localhost:5173']);
});

test('API answers CORS preflight for the configured frontend only', async () => {
  process.env.CLIENT_URL = 'https://bioguard.vercel.app/';
  const { app } = await import('../src/app.js');
  const srv = app.listen(0);
  const port = srv.address().port;
  const ask = (origin) => new Promise((resolve) => {
    const r = request.request({ host: '127.0.0.1', port, path: '/api/health', method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } }, (res) => { res.resume(); resolve(res.headers['access-control-allow-origin']); });
    r.end();
  });
  assert.equal(await ask('https://bioguard.vercel.app'), 'https://bioguard.vercel.app');
  assert.equal(await ask('https://evil.example'), undefined);
  srv.close();
});
