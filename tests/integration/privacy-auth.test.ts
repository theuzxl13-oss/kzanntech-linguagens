import { describe, expect, it } from "vitest";
import { deleteAccount, login } from "../../src/lib/server/accounts";
import { query, queryOne } from "../../src/lib/server/db";
import { makeUser } from "./helpers";

describe("SEC-04: rehash transparente", () => {
  it("login com hash antigo (p=1) funciona e atualiza para os parâmetros atuais", async () => {
    const u = await makeUser();
    // hash legado de "senha12345" com N=16384, r=8, p=1
    const { scrypt, randomBytes } = await import("node:crypto");
    const salt = randomBytes(16);
    const key: Buffer = await new Promise((res, rej) => scrypt("senha12345", salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
    await query(`update users set password_hash = $2 where id = $1`, [u.id, `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`]);
    await login({ email: u.email, password: "senha12345" }, { ip: "rh" });
    const row = await queryOne<{ password_hash: string }>(`select password_hash from users where id = $1`, [u.id]);
    expect(row!.password_hash.startsWith("scrypt$16384$8$5$")).toBe(true);
    await login({ email: u.email, password: "senha12345" }, { ip: "rh" });
  });
});

describe("PRIV-01: dados pessoais", () => {
  it("exclusão de conta remove os e-mails enviados ao titular", async () => {
    const u = await makeUser();
    expect((await query(`select 1 from email_outbox where to_email = $1`, [u.email])).length).toBeGreaterThan(0);
    await deleteAccount(u.id, { password: "senha12345", confirm: "EXCLUIR" }, { ip: "x" });
    expect(await query(`select 1 from email_outbox where to_email = $1`, [u.email])).toHaveLength(0);
  });

  it("chaves de rate limit não guardam e-mail nem IP em texto", async () => {
    const u = await makeUser();
    await login({ email: u.email, password: "errada123" }, { ip: "198.51.100.23" }).catch(() => {});
    const rows = await query<{ key: string }>(`select key from rate_limits`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.key.includes(u.email) || r.key.includes("198.51.100.23"))).toBe(false);
  });
});
