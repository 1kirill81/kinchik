import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { torrserver } from '@/lib/torrserver';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

export async function GET() {
  const timestamp = new Date().toISOString();
  let dbOk = false;
  let storageWritable = false;
  let torrserverOk = false;

  // 1. Critical Check: SQLite Database
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT 1 as ok').get() as { ok: number } | undefined;
    if (row && row.ok === 1) {
      dbOk = true;
    }
  } catch (err) {
    console.error('Healthcheck DB failure:', err);
    dbOk = false;
  }

  // 2. Critical Check: Data Directory Write Access
  try {
    const testFile = path.join(DATA_DIR, `.health_${Date.now()}`);
    fs.writeFileSync(testFile, 'ok', 'utf8');
    fs.unlinkSync(testFile);
    storageWritable = true;
  } catch (err) {
    console.error('Healthcheck storage write failure:', err);
    storageWritable = false;
  }

  // 3. Non-fatal external check: TorrServer
  try {
    torrserverOk = await torrserver.ping();
  } catch {
    torrserverOk = false;
  }

  const isHealthy = dbOk && storageWritable;
  const status = isHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp,
      services: {
        database: dbOk ? 'up' : 'down',
        storage: storageWritable ? 'writable' : 'unwritable',
        torrserver: torrserverOk ? 'reachable' : 'unreachable',
        tmdbConfigured: Boolean(process.env.TMDB_API_KEY),
        jackettConfigured: Boolean(process.env.JACKETT_API_KEY),
      },
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
