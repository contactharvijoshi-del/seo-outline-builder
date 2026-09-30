// File-based cache so repeat keywords cost nothing and return instantly.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export function makeCache(dir, ttlHours) {
  const ttl = ttlHours * 3600 * 1000;
  return {
    key(parts) {
      return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
    },
    async get(k) {
      if (ttl <= 0) return null;
      try {
        const raw = JSON.parse(await readFile(path.join(dir, `${k}.json`), 'utf8'));
        return Date.now() - raw.savedAt > ttl ? null : raw.value;
      } catch {
        return null;
      }
    },
    async set(k, value) {
      if (ttl <= 0) return;
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${k}.json`), JSON.stringify({ savedAt: Date.now(), value }));
    },
  };
}
