// Driver S3 (produção na AWS). As credenciais vêm da IAM Role (instance profile) dos workers —
// nenhuma access key fica em arquivo (mínimo privilégio / segredos fora do código).
// S3_ENDPOINT aponta para um S3 compatível (s3mock) nos testes e no K3s local; na AWS fica vazio.
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export function createS3Storage({ S3_BUCKET, S3_PUBLIC_URL, S3_ENDPOINT, AWS_REGION }) {
  const client = new S3Client({
    region: AWS_REGION,
    ...(S3_ENDPOINT && { endpoint: S3_ENDPOINT, forcePathStyle: true }),
  });
  const base =
    S3_PUBLIC_URL ||
    (S3_ENDPOINT ? `${S3_ENDPOINT}/${S3_BUCKET}` : `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`);

  return {
    async save(buffer, ext) {
      const key = `meals/${randomUUID()}.${ext}`;
      await client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: CONTENT_TYPES[ext],
          ServerSideEncryption: 'AES256', // criptografia em repouso (Aula 3)
        }),
      );
      return key;
    },
    async remove(key) {
      if (!key) return;
      await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    },
    url: (key) => (key ? `${base}/${key}` : null),
  };
}
