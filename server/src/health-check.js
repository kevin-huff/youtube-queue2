// Health check script for Docker
const http = require('http');

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
const host = process.env.HEALTHCHECK_HOST || '127.0.0.1';
const path = process.env.HEALTHCHECK_PATH || '/health';
const options = {
  hostname: host,
  port,
  path,
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    console.log('Health check passed');
    process.exit(0);
  } else {
    console.log(`Health check failed with status: ${res.statusCode}`);
    process.exit(1);
  }
});

req.on('error', (err) => {
  console.log(`Health check failed: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('Health check timed out');
  req.destroy();
  process.exit(1);
});

req.end();
