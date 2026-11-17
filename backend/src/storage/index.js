// ADR-05 — Storage plugável. Interface: save(buffer, ext) → key · remove(key) · url(key).
// Troca local → S3 apenas com STORAGE_DRIVER=s3 (RNF-02).
import { config } from '../config.js';
import { createLocalStorage } from './local.js';
import { createS3Storage } from './s3.js';

export const storage =
  config.STORAGE_DRIVER === 's3' ? createS3Storage(config) : createLocalStorage(config);
