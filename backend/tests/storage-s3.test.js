// ADR-05 — Driver S3 contra um S3 compatível (adobe/s3mock): mesmo código que roda na AWS.
// O CI e o docker-compose.test.yml sobem o s3mock e definem S3_TEST_ENDPOINT.
import { beforeAll, describe, expect, it } from 'vitest';
import { createS3Storage } from '../src/storage/s3.js';
import { PNG } from './helpers.js';

const endpoint = process.env.S3_TEST_ENDPOINT;
// O s3mock não valida assinatura, mas o SDK exige alguma credencial.
process.env.AWS_ACCESS_KEY_ID ??= 's3mock';
process.env.AWS_SECRET_ACCESS_KEY ??= 's3mock';

describe.skipIf(!endpoint)('Storage S3 (s3mock)', () => {
  const storage = createS3Storage({ S3_BUCKET: 'marmifit-teste', S3_ENDPOINT: endpoint, AWS_REGION: 'us-east-1' });

  // O s3mock leva alguns segundos para subir (JVM): espera até 60 s.
  beforeAll(async () => {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(endpoint)).ok) return;
      } catch {
        /* ainda subindo */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`s3mock não respondeu em ${endpoint}`);
  }, 65_000);

  it('salva com chave meals/<uuid>.<ext>, serve pela URL pública e remove', async () => {
    const key = await storage.save(PNG, 'png');
    expect(key).toMatch(/^meals\/[0-9a-f-]{36}\.png$/);

    const url = storage.url(key);
    expect(url).toBe(`${endpoint}/marmifit-teste/${key}`);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);

    await storage.remove(key);
    expect((await fetch(url)).status).toBe(404);
  });

  it('remove(null) não faz nada e url(null) é null', async () => {
    await expect(storage.remove(null)).resolves.toBeUndefined();
    expect(storage.url(null)).toBeNull();
  });

  it('S3_PUBLIC_URL (CloudFront/bucket público) tem prioridade na URL', () => {
    const s = createS3Storage({ S3_BUCKET: 'b', S3_PUBLIC_URL: 'https://cdn.exemplo.com', AWS_REGION: 'us-east-1' });
    expect(s.url('meals/x.png')).toBe('https://cdn.exemplo.com/meals/x.png');
    const aws = createS3Storage({ S3_BUCKET: 'b', AWS_REGION: 'sa-east-1' });
    expect(aws.url('meals/x.png')).toBe('https://b.s3.sa-east-1.amazonaws.com/meals/x.png');
  });
});
