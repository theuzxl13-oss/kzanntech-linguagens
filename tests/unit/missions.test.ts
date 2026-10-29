import { describe, expect, it } from "vitest";
import { MISSION_SPECS } from "../../db/seed/missions";
import { evaluateStep, hintText, missionStatus, missionXp, stepScore, validateMissionSpec, MISSION_XP } from "../../src/lib/domain/missions";

const es = MISSION_SPECS.es;

describe("conteúdo das missões", () => {
  it("todas as missões são válidas: respostas-modelo passam e não disparam erros cadastrados", () => {
    for (const [lang, missions] of Object.entries(MISSION_SPECS)) {
      for (const [slug, spec] of Object.entries(missions)) {
        expect(validateMissionSpec(spec, lang), `${lang}/${slug}`).toEqual([]);
      }
    }
  });
});

describe("avaliação de etapas (sem IA, determinística)", () => {
  const pedido = es.cafe.steps[0];
  const nome = es.encontro.steps[0];

  it("aceita formulações diferentes com o mesmo sentido, não só a resposta-modelo", () => {
    for (const a of ["Un café, por favor.", "Quisiera un café con leche", "Para mí, agua, por favor", "me trae un té?"]) {
      expect(evaluateStep(pedido, a, "es").passed, a).toBe(true);
    }
    expect(evaluateStep(nome, "Buenas tardes, mi nombre es Pedro", "es").passed).toBe(true);
  });

  it("recusa resposta sem a ideia obrigatória e diz o que falta", () => {
    const r = evaluateStep(pedido, "Hola, buenos días", "es");
    expect(r.passed).toBe(false);
    expect(r.missing).toEqual(["uma bebida"]);
    expect(r.feedback[0]).toMatch(/Ainda falta dizer: uma bebida/);
    expect(evaluateStep(nome, "Me llamo Ana", "es").missing).toEqual(["um cumprimento"]);
  });

  it("resposta vazia ou só espaços não passa", () => {
    expect(evaluateStep(pedido, "   ", "es")).toMatchObject({ passed: false });
  });

  it("palavra só como parte de outra não conta (limite de palavra)", () => {
    // "té" não deve casar dentro de "tétrico"; "no" não deve casar dentro de "nombre"
    expect(evaluateStep(pedido, "tétrico", "es").passed).toBe(false);
    expect(evaluateStep(es.cafe.steps[2], "nombre", "es").passed).toBe(false);
  });

  it("acento ausente é aceito com aviso; erro de digitação em palavra longa também", () => {
    const r = evaluateStep(es.encontro.steps[1], "Soy de Brasil, soy brasileno", "es");
    expect(r.passed).toBe(true);
    const typo = evaluateStep(es.cafe.steps[1], "una ensalda, por favor", "es");
    expect(typo.passed).toBe(true);
    expect(typo.feedback.join(" ")).toMatch(/grafia é "ensalada"/);
    const accent = evaluateStep(MISSION_SPECS.fr.encontro.steps[1], "Je viens du Bresil", "fr");
    expect(accent.passed).toBe(true);
    expect(accent.feedback.join(" ")).toMatch(/acentuação/);
  });

  it("aponta erro de gramática cadastrado sem impedir a comunicação", () => {
    const r = evaluateStep(pedido, "Quiero una café", "es");
    expect(r.passed).toBe(true);
    expect(r.grammar).toEqual([{ explanationPt: "\"Café\" é masculino em espanhol.", correction: "un café" }]);
    const de = evaluateStep(MISSION_SPECS.de.cafe.steps[0], "Ich möchte ein Kaffee", "de");
    expect(de.grammar[0].correction).toBe("einen Kaffee");
    const en = evaluateStep(MISSION_SPECS.en.encontro.steps[1], "I from Brazil", "en");
    expect(en.missing).toContain('um verbo como "sou" ou "venho"');
    expect(en.grammar[0].correction).toBe("I'm from Brazil");
  });

  it("contrações do inglês equivalem à forma por extenso", () => {
    expect(evaluateStep(MISSION_SPECS.en.encontro.steps[1], "I'm from Brazil", "en").passed).toBe(true);
    expect(evaluateStep(MISSION_SPECS.en.cafe.steps[2], "No thanks, that's all", "en").passed).toBe(true);
  });

  it("sugere cortesia quando a mensagem passa sem ela", () => {
    const r = evaluateStep(pedido, "Un café", "es");
    expect(r.passed).toBe(true);
    expect(r.bonusMissing).toEqual(['"por favor"']);
    expect(r.feedback.join(" ")).toMatch(/mais natural/);
  });

  it("respostas muito longas são truncadas antes da avaliação", () => {
    expect(evaluateStep(pedido, "x ".repeat(400) + "café", "es").passed).toBe(false);
  });
});

describe("dicas, pontuação, XP e desbloqueio", () => {
  it("dicas progressivas terminam na resposta-modelo", () => {
    const s = es.cafe.steps[0];
    expect(hintText(s, 1)).toBe(s.hints[0]);
    expect(hintText(s, 2)).toBe(s.hints[1]);
    expect(hintText(s, 3)).toBe(s.model);
  });

  it("pontuação cai com dicas e tentativas; resposta-modelo limita a 0,3", () => {
    expect(stepScore(true, 1, 0, false)).toBe(1);
    expect(stepScore(true, 2, 1, false)).toBe(0.75);
    expect(stepScore(true, 1, 3, false)).toBe(0.3);
    expect(stepScore(false, 3, 0, false)).toBe(0);
    expect(stepScore(true, 3, 2, true)).toBeGreaterThanOrEqual(0.1);
  });

  it("XP: primeira conclusão proporcional ao desempenho, repetição rende pouco, teto em 24 h", () => {
    expect(missionXp(1, true, 0)).toBe(MISSION_XP.first);
    expect(missionXp(0.1, true, 0)).toBe(MISSION_XP.minFirst);
    expect(missionXp(1, false, 0)).toBe(MISSION_XP.repeat);
    expect(missionXp(1, true, MISSION_XP.dailyCap - 5)).toBe(5);
    expect(missionXp(1, true, MISSION_XP.dailyCap + 50)).toBe(0);
  });

  it("desbloqueio: missão anterior + mínimo de lições", () => {
    const m = { id: "es-cafe", requiresMission: "es-encontro", requiresLessons: 2 };
    expect(missionStatus(m, new Set(), 5)).toBe("locked");
    expect(missionStatus(m, new Set(["es-encontro"]), 1)).toBe("locked");
    expect(missionStatus(m, new Set(["es-encontro"]), 2)).toBe("available");
    expect(missionStatus(m, new Set(["es-encontro", "es-cafe"]), 0)).toBe("completed");
  });
});
