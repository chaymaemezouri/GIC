#!/usr/bin/env node
const port = process.env.PORT || 4000;
const url = process.env.HEALTH_URL || `http://localhost:${port}/api/health`;

try {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.ok) {
    console.error('Health check failed:', res.status, body);
    process.exit(1);
  }
  console.log('OK', body);
} catch (err) {
  console.error('Health check error:', err instanceof Error ? err.message : err);
  process.exit(1);
}
