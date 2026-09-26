/*
 * BFL Live API - read-only cache endpoint.
 * The actual YouTube monitoring runs in monitor/live-monitor.js (GitHub Actions)
 * and writes data/live-status.json. Vercel never polls YouTube for 70+ channels.
 */
const fs = require('fs');
const path = require('path');

const STATUS_FILE = path.join(__dirname, '..', 'data', 'live-status.json');

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch (_) {
    return {
      version: 2,
      updated: null,
      total: 0,
      checked: 0,
      failed: 0,
      unknown: 0,
      live: [],
      channels: []
    };
  }
}

module.exports = async (req, res) => {
  const data = readStatus();
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(JSON.stringify(data));
};
