const assert = require('assert');
const http = require('http');
const express = require('express');
const { createHealthRouter } = require('../src/routes/health');

async function request(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testHealthReturnsApiAndDatabaseStatus() {
  const app = express();
  app.use('/api/health', createHealthRouter({
    pool: { execute: async () => [[{ connected: 1 }]] },
    getUptimeSeconds: () => 12.5,
    now: () => new Date('2026-11-09T12:00:00.000Z')
  }));

  const response = await request(app);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    success: true,
    data: {
      status: 'ok',
      database: 'connected',
      server_time: '2026-11-09T12:00:00.000Z',
      uptime_seconds: 12
    }
  });
}

async function testHealthReturns503WhenDatabaseUnavailable() {
  const app = express();
  app.use('/api/health', createHealthRouter({
    pool: { execute: async () => { throw new Error('database offline'); } },
    getUptimeSeconds: () => 1,
    now: () => new Date('2026-11-09T12:00:00.000Z')
  }));

  const response = await request(app);
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    success: false,
    data: {
      status: 'unhealthy',
      database: 'disconnected',
      server_time: '2026-11-09T12:00:00.000Z',
      uptime_seconds: 1
    }
  });
}

async function testHealthWithLiveDatabase() {
  const pool = require('../src/config/db');
  const app = express();
  app.use('/api/health', createHealthRouter({ pool }));

  const response = await request(app);
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.status, 'ok');
  assert.equal(response.body.data.database, 'connected');
  assert.equal(typeof response.body.data.server_time, 'string');
  assert.equal(Number.isInteger(response.body.data.uptime_seconds), true);
  await pool.end();
}

async function main() {
  await testHealthReturnsApiAndDatabaseStatus();
  console.log('PASS health API and database status');
  await testHealthReturns503WhenDatabaseUnavailable();
  console.log('PASS health database outage status');
  await testHealthWithLiveDatabase();
  console.log('PASS health endpoint with live MySQL');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
