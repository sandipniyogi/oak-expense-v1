import { readdir, stat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const TYPES = {
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image',
  '.webp': 'image', '.mp4': 'video', '.mov': 'video'
};

export async function discoverMedia(root, {
  minimumAgeMs = 120000,
  now = Date.now()
} = {}) {
  const base = await realpath(root);
  const results = [];
  const seen = new Set();

  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scan(full);
        continue;
      }

      const type = TYPES[path.extname(entry.name).toLowerCase()];
      if (!entry.isFile() || !type) continue;

      const info = await stat(full);
      if (now - info.mtimeMs < minimumAgeMs) continue;

      const hash = createHash('sha256');

      for await (const chunk of createReadStream(full)) {
        hash.update(chunk);
      }

      const checksum = hash.digest('hex');
      if (seen.has(checksum)) continue;
      seen.add(checksum);

      results.push({
        path: path.relative(base, full),
        type,
        size: info.size,
        checksum
      });
    }
  }

  await scan(base);
  return results;
}
