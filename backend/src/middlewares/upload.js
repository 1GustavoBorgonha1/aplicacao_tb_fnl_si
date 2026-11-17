// Spec 003 — upload seguro de imagem (CA-003-04, RS-003-01, RS-003-02).
import multer from 'multer';
import { badRequest } from '../errors.js';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 20 },
});

/** Aceita no máximo um arquivo no campo `imagem` e converte erros do multer em 400. */
export function singleImage(req, res, next) {
  upload.single('imagem')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(badRequest('Imagem maior que 2 MB'));
    return next(badRequest('Upload inválido'));
  });
}

/**
 * Detecta o tipo REAL do arquivo pelos primeiros bytes (magic bytes).
 * O Content-Type e a extensão enviados pelo cliente são ignorados.
 * @returns {'jpg'|'png'|'webp'|null}
 */
export function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
