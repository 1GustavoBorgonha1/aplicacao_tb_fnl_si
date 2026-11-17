// RS-001-01 — bcrypt com salt aleatório e custo configurável.
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

export const hashPassword = (senha) => bcrypt.hash(senha, config.BCRYPT_COST);

export const verifyPassword = (senha, hash) => bcrypt.compare(senha, hash);

// Hash válido usado quando o e-mail não existe: o tempo de resposta fica igual
// ao de uma senha errada, dificultando enumeração de usuários (RS-001-03).
export const DUMMY_HASH = bcrypt.hashSync('marmifit-dummy-password', 4);
