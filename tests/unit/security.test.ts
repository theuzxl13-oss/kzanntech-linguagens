import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/domain/safe-redirect";
import { minLessonSeconds } from "@/lib/domain/lessons";
import { resolveClientIp } from "@/lib/server/client-ip";
import { readBodyLimited } from "@/lib/server/body";
import { isAllowedAudioUrl } from "@/lib/server/game/sessions";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/server/password";

const headers = (h: Record<string, string>) => (n: string) => h[n] ?? null;

describe("SEC-01: IP do cliente", () => {
  it("sem proxy confiável ignora cabeçalhos forjáveis", () => {
    expect(resolveClientIp(headers({ "x-forwarded-for": "1.2.3.4" }), "none")).toBe("unknown");
  });
  it("xff usa o valor mais à direita (adicionado pelo proxy), não o do cliente", () => {
    expect(resolveClientIp(headers({ "x-forwarded-for": "6.6.6.6, 10.0.0.1, 198.51.100.7" }), "xff")).toBe("198.51.100.7");
  });
  it("cloudflare usa CF-Connecting-IP e ignora X-Forwarded-For", () => {
    expect(resolveClientIp(headers({ "cf-connecting-ip": "2001:db8::1", "x-forwarded-for": "6.6.6.6" }), "cloudflare")).toBe("2001:db8::1");
  });
  it("valor inválido vira 'unknown'", () => {
    expect(resolveClientIp(headers({ "cf-connecting-ip": "<script>" }), "cloudflare")).toBe("unknown");
  });
});

describe("SEC-02: redirecionamento seguro", () => {
  const o = "https://app.example";
  it.each([
    ["/\\evil.example/roubar"],
    ["//evil.example"],
    ["https://evil.example"],
    ["/\t/evil.example"],
    ["javascript:alert(1)"],
    ["painel"],
    [""],
  ])("bloqueia %j", (v) => expect(safeInternalPath(v, o)).toBeNull());
  it("aceita caminhos internos com busca e âncora", () => {
    expect(safeInternalPath("/rankings?board=voice#topo", o)).toBe("/rankings?board=voice#topo");
  });
});

describe("SEC-03: limite do corpo", () => {
  it("recusa corpo acima do limite mesmo sem Content-Length", async () => {
    const big = new ReadableStream({
      start(c) {
        for (let i = 0; i < 10; i++) c.enqueue(new Uint8Array(10_000));
        c.close();
      },
    });
    const req = new Request("http://x/", { method: "POST", body: big, duplex: "half" } as RequestInit);
    await expect(readBodyLimited(req, 50_000)).rejects.toMatchObject({ status: 413 });
  });
  it("recusa pelo Content-Length declarado antes de ler", async () => {
    const req = new Request("http://x/", { method: "POST", body: "{}", headers: { "content-length": "999999" } });
    await expect(readBodyLimited(req, 1000)).rejects.toMatchObject({ status: 413 });
  });
  it("lê corpos dentro do limite", async () => {
    const req = new Request("http://x/", { method: "POST", body: '{"a":1}' });
    expect(new TextDecoder().decode(await readBodyLimited(req, 1000))).toBe('{"a":1}');
  });
});

describe("SEC-04: hash de senha", () => {
  it("novos hashes usam os parâmetros atuais e não precisam de rehash", async () => {
    const h = await hashPassword("senha12345");
    expect(h.startsWith("scrypt$16384$8$5$")).toBe(true);
    expect(needsRehash(h)).toBe(false);
    expect(await verifyPassword("senha12345", h)).toBe(true);
    expect(await verifyPassword("outra", h)).toBe(false);
  });
  it("hashes antigos (p=1) são marcados para rehash", () => {
    expect(needsRehash("scrypt$16384$8$1$c2FsdA==$a2V5")).toBe(true);
    expect(needsRehash("lixo")).toBe(true);
  });
});

describe("R-05: origem dos áudios", () => {
  it("aceita caminhos locais e hosts permitidos; recusa o resto", () => {
    expect(isAllowedAudioUrl("/audio/en/hello.mp3", "")).toBe(true);
    expect(isAllowedAudioUrl("https://cdn.example/a.mp3", "cdn.example")).toBe(true);
    expect(isAllowedAudioUrl("https://169.254.169.254/latest", "cdn.example")).toBe(false);
    expect(isAllowedAudioUrl("http://cdn.example/a.mp3", "cdn.example")).toBe(false);
    expect(isAllowedAudioUrl("//cdn.example/a.mp3", "cdn.example")).toBe(false);
  });
});

describe("INT-01: tempo mínimo da lição", () => {
  it("proporcional ao número de exercícios, com piso", () => {
    expect(minLessonSeconds(1)).toBe(10);
    expect(minLessonSeconds(9)).toBe(46);
  });
});
