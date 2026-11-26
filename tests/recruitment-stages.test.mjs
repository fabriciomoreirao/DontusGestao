import assert from "node:assert/strict";
import test from "node:test";
import {
  recruitmentStages,
  DEFAULT_RECRUITMENT_STAGES,
} from "../lib/recruitment.ts";

test("processos antigos e ausência de catálogos sempre apresentam as etapas do quadro", () => {
  for (const value of [undefined, null, [], [" ", null], {}, "Currículo"]) {
    assert.deepEqual(recruitmentStages(value, []), DEFAULT_RECRUITMENT_STAGES);
  }
});
test("preserva a ordem configurada e as candidaturas recebidas em etapas antigas", () => {
  assert.deepEqual(
    recruitmentStages(
      [" Triagem inicial ", "Entrevista", "Entrevista"],
      [],
      ["Currículo", "Entrevista"],
    ),
    ["Triagem inicial", "Entrevista", "Currículo"],
  );
});
