// Driver S3 (produção na AWS). As credenciais vêm da IAM Role da EC2 —
// nenhuma access key fica no .env (mínimo privilégio / segredos fora do código).
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export function createS3Storage({ S3_BUCKET, S3_PUBLIC_URL, AWS_REGION }) {
  const client = new S3Client({ region: AWS_REGION });
  const base = S3_PUBLIC_URL || `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`;

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
