// Variáveis padrão para testes (podem ser sobrescritas pelo ambiente/CI).
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://marmifit:marmifit@localhost:5432/marmifit_test';
process.env.JWT_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres!!';
process.env.BCRYPT_COST ??= '4';
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOAD_DIR ??= path.join(os.tmpdir(), 'marmifit-test-uploads');
process.env.LOGIN_RATE_LIMIT ??= '1000';
process.env.ADMIN_EMAIL ??= 'admin@marmifit.local';
process.env.ADMIN_PASSWORD ??= 'Admin12345';
