// Driver local: grava imagens em UPLOAD_DIR (volume Docker). Usado no desenvolvimento.
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export function createLocalStorage({ UPLOAD_DIR }) {
  const root = path.resolve(UPLOAD_DIR);

  // Garante que a key resolvida continua dentro de UPLOAD_DIR (path traversal).
  const resolveKey = (key) => {
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error('key inválida');
    return full;
  };

  return {
    root,
    async save(buffer, ext) {
      const key = `meals/${randomUUID()}.${ext}`; // CA-003-05: nome aleatório
      const full = resolveKey(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, buffer, { mode: 0o640 });
      return key;
    },
    async remove(key) {
      if (!key) return;
      await unlink(resolveKey(key)).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
    },
    url: (key) => (key ? `/uploads/${key}` : null),
  };
}
