import assert from "node:assert/strict";
import test from "node:test";
import { cancellationReversalOwner, cancellationResponsibleName, cancellationResponsibilitySummary } from "../lib/cancellation-responsibility.ts";

const entry = (status, cents, seller = "Vendedor", csOwner = "CS", reversalOwner = "Reversão") => ({
  item: { owner: "Responsável antigo", status }, detail: { seller, csOwner, reversalOwner, monthlyValueCents: cents },
});

test("a reversão é independente do vendedor e do CS e preserva o responsável de cards antigos", () => {
  const record = entry("Em processo", 10000);
  assert.equal(cancellationResponsibleName(record, "seller"), "Vendedor");
  assert.equal(cancellationResponsibleName(record, "csOwner"), "CS");
  assert.equal(cancellationResponsibleName(record, "reversalOwner"), "Reversão");
  assert.equal(cancellationReversalOwner({ csOwner: "CS" }, "Responsável antigo"), "Responsável antigo");
  assert.equal(cancellationReversalOwner({ csOwner: "CS" }), "");
  assert.equal(cancellationResponsibleName({ ...record, detail: { monthlyValueCents: 0 } }, "seller"), "Não informado");
});

test("cada papel agrupa seus próprios resultados e valores, incluindo solicitações em andamento", () => {
  const records = [entry("Convertido", 10000), entry("Não convertido", 15000, "Vendedor", "Outro CS", "Outra reversão"), entry("Follow up", 20000)];
  assert.deepEqual(cancellationResponsibilitySummary(records, "seller"), [
    { name: "Vendedor", total: 3, converted: 1, lost: 1, progress: 1, recoveredMrr: 10000, lostMrr: 15000 },
  ]);
  assert.deepEqual(cancellationResponsibilitySummary(records, "csOwner")[0],
    { name: "CS", total: 2, converted: 1, lost: 0, progress: 1, recoveredMrr: 10000, lostMrr: 0 });
  assert.deepEqual(cancellationResponsibilitySummary(records, "reversalOwner")[0],
    { name: "Reversão", total: 2, converted: 1, lost: 0, progress: 1, recoveredMrr: 10000, lostMrr: 0 });
  assert.deepEqual(cancellationResponsibilitySummary([], "reversalOwner"), []);
});
