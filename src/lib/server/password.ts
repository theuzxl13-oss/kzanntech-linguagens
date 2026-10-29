import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt (memory-hard) da biblioteca padrão do Node — sem dependências nativas.
// Parâmetros equivalentes ao mínimo recomendado pela OWASP (N=2^17, r=8, p=1 ≈ N=2^14, r=8, p=5),
// usando 16 MiB de memória por hash — compatível com o limite de memória do Cloudflare Workers.
export const SCRYPT_PARAMS = { N: 16384, r: 8, p: 5 } as const;
const { N, r, p } = SCRYPT_PARAMS;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** O hash foi gerado com parâmetros mais fracos que os atuais e deve ser refeito no próximo login? */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  const [, n, rr, pp] = parts.map((x, i) => (i === 0 ? 0 : Number(x)));
  return n < N || rr < r || pp < p;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, rr, pp, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(rr),
    p: Number(pp),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}
