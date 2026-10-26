import { describe, expect, it } from "vitest";
import { buildExercises, buildPath, lessonStars, nextLesson, writingHint } from "@/lib/domain/lessons";

const units = [
  { unitId: 1, title: "Cumprimentos · A1", icon: "👋", level: "A1", levelOrder: 1, itemCount: 5 },
  { unitId: 2, title: "Números · A1", icon: "🔢", level: "A1", levelOrder: 1, itemCount: 5 },
  { unitId: 3, title: "Viagens · A2", icon: "✈️", level: "A2", levelOrder: 2, itemCount: 4 },
  { unitId: 4, title: "Trabalho · B1", icon: "💼", level: "B1", levelOrder: 3, itemCount: 3 },
];

describe("trilha de aprendizado", () => {
  it("iniciante: só a primeira lição está liberada", () => {
    const p = buildPath(units, new Map(), 1);
    expect(p.map((l) => l.status)).toEqual(["available", "locked", "locked", "locked"]);
    expect(nextLesson(p)?.unitId).toBe(1);
  });
  it("concluir uma lição libera a próxima", () => {
    const p = buildPath(units, new Map([[1, 0.9]]), 1);
    expect(p.map((l) => l.status)).toEqual(["completed", "available", "locked", "locked"]);
    expect(p[0].bestAccuracy).toBe(0.9);
  });
  it("aluno de nível B1 pode pular as lições dos níveis anteriores", () => {
    const p = buildPath(units, new Map(), 3);
    expect(p.map((l) => l.status)).toEqual(["available", "available", "available", "locked"]);
  });
  it("estrelas pela precisão", () => {
    expect(lessonStars(1)).toBe(3);
    expect(lessonStars(0.75)).toBe(2);
    expect(lessonStars(0.2)).toBe(1);
  });
});

describe("exercícios da lição", () => {
  const lesson = {
    items: [
      { id: 1, text: "hello", translation: "olá", explanation: null, kind: "word", altTarget: ["hi"], altPt: ["oi"] },
      { id: 2, text: "good morning", translation: "bom dia", explanation: null, kind: "phrase", altTarget: [], altPt: [] },
      { id: 3, text: "thank you", translation: "obrigado", explanation: null, kind: "word", altTarget: ["thanks"], altPt: [] },
    ],
    distractors: { pt: ["casa", "água", "pão"], target: ["house", "water", "bread"] },
  };
  it("progride de reconhecer para escolher e escrever", () => {
    const ex = buildExercises(lesson);
    expect(ex.slice(0, 3).every((e) => e.type === "choose_pt")).toBe(true);
    expect(ex.slice(3, 6).every((e) => e.type === "choose_target")).toBe(true);
    expect(ex.slice(6).every((e) => e.type === "write")).toBe(true);
    expect(ex).toHaveLength(9);
  });
  it("múltipla escolha sempre contém a resposta certa e opções distintas", () => {
    for (const e of buildExercises(lesson)) {
      if (e.type === "write") continue;
      expect(e.options).toContain(e.answer);
      expect(new Set(e.options).size).toBe(e.options.length);
      expect(e.options.length).toBe(4);
    }
  });
  it("distratores têm tamanho parecido com a resposta (palavra com palavras)", () => {
    const l = {
      items: [{ id: 1, text: "yes", translation: "sim", explanation: null, kind: "word", altTarget: [], altPt: [] }],
      distractors: { pt: ["não", "casa", "pão", "água", "Você pode repetir, por favor?", "Eu trabalho em um escritório."], target: ["no", "house", "bread", "water"] },
    };
    for (let i = 0; i < 20; i++) {
      const ex = buildExercises(l).find((e) => e.type === "choose_pt");
      expect(ex && "options" in ex && ex.options.every((o) => o.split(" ").length === 1)).toBe(true);
    }
  });
  it("dica de escrita mostra a primeira letra de cada palavra", () => {
    expect(writingHint("I like learning.")).toBe("I l___ l_______.");
    expect(writingHint("¿Cómo estás?")).toBe("¿C___ e____?");
  });
});
