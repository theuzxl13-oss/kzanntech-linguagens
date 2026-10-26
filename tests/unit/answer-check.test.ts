import { describe, expect, it } from "vitest";
import { checkAnswer, foldAccents, normalizeAnswer } from "@/lib/domain/answer-check";

const acc = (primary: string, ...alts: string[]) => [{ answer: primary, isPrimary: true }, ...alts.map((a) => ({ answer: a, isPrimary: false }))];

describe("normalizeAnswer", () => {
  it("ignora maiúsculas, pontuação e espaços extras", () => {
    expect(normalizeAnswer("  Bom   DIA!! ")).toBe("bom dia");
    expect(normalizeAnswer("¿Cómo estás?")).toBe("cómo estás");
  });
  it("trata hífens e apóstrofos tipográficos", () => {
    expect(normalizeAnswer("Comment allez-vous ?", "fr")).toBe("comment allez vous");
    expect(normalizeAnswer("J’ai deux frères", "fr")).toBe(normalizeAnswer("J'ai deux frères", "fr"));
  });
  it("expande contrações do inglês", () => {
    expect(normalizeAnswer("I'm from Brazil", "en")).toBe("i am from brazil");
    expect(normalizeAnswer("I don't understand", "en")).toBe(normalizeAnswer("I do not understand", "en"));
  });
  it("remove diacríticos e ligaduras no fold", () => {
    expect(foldAccents("ação größe cœur")).toBe("acao grosse coeur");
  });
});

describe("checkAnswer", () => {
  it("aceita a resposta principal ignorando caixa e pontuação", () => {
    const r = checkAnswer("bom dia", acc("bom dia"), "pt");
    expect(r.result).toBe("correct");
    expect(r.credit).toBe(1);
  });
  it("aceita traduções alternativas cadastradas", () => {
    const r = checkAnswer("oi", acc("olá", "oi"), "pt");
    expect(r.result).toBe("correct");
    expect(r.isAlternative).toBe(true);
    expect(r.feedback[0]).toContain("alternativa");
  });
  it("acentuação ausente vale crédito parcial", () => {
    const r = checkAnswer("ola", acc("olá"), "pt");
    expect(r.result).toBe("accent");
    expect(r.credit).toBe(0.75);
  });
  it("aceita transliteração alemã como acentuação", () => {
    expect(checkAnswer("fuenf", acc("fünf"), "de").result).toBe("accent");
  });
  it("tolera um erro de digitação em respostas médias", () => {
    const r = checkAnswer("I like lerning", acc("I like learning."), "en");
    expect(r.result).toBe("typo");
    expect(r.credit).toBe(0.5);
  });
  it("não tolera erro em palavras curtas (não ≠ mão)", () => {
    expect(checkAnswer("mão", acc("não"), "pt").result).toBe("wrong");
    expect(checkAnswer("tres", acc("trois"), "fr").result).toBe("wrong");
  });
  it("resposta vazia é errada com explicação", () => {
    const r = checkAnswer("   ", acc("hello"), "en");
    expect(r.result).toBe("wrong");
    expect(r.feedback[0]).toMatch(/Nenhuma resposta/);
  });
  it("resposta errada mostra a forma esperada", () => {
    const r = checkAnswer("good night", acc("good morning"), "en");
    expect(r.result).toBe("wrong");
    expect(r.matched).toBe("good morning");
  });
  it("contração equivale à forma por extenso", () => {
    expect(checkAnswer("I do not understand", acc("I don't understand."), "en").result).toBe("correct");
  });
  it("prefere o melhor resultado entre várias respostas aceitas", () => {
    const r = checkAnswer("la madre", acc("la madre", "madre", "mamá"), "es");
    expect(r.result).toBe("correct");
    expect(r.isAlternative).toBe(false);
  });
});
