import assert from "node:assert/strict";
import test from "node:test";
import { cancellationTaskInitial, cancellationTaskSector } from "../lib/cancellation-tasks.ts";

const departments = [{ id: "commercial", name: "Comercial", active: true }, { id: "support", name: "Suporte", active: true }, { id: "inactive", name: "Antigo", active: false }];
const collaborators = [{ email: "ana@test.local", active: true, departmentIds: ["support", "commercial"], coordinatorDepartmentIds: [] }];
test("a tarefa começa no setor do colaborador, respeitando os setores permitidos", () => {
  const user = { email: "ANA@test.local", department: " Suporte " };
  assert.deepEqual(cancellationTaskSector(departments, collaborators, user, false), { departmentIds: ["commercial", "support"], initialDepartmentId: "support" });
  assert.deepEqual(cancellationTaskSector(departments, [], user, false), { departmentIds: [], initialDepartmentId: undefined });
  assert.equal(cancellationTaskSector(departments, [], user, true).initialDepartmentId, "support");
});
test("o formulário herda cliente, protocolo, contexto e telefone do cancelamento", () => {
  const draft = cancellationTaskInitial({ protocol: "C260002", clientId: "250105", customerName: "Clínica", reason: "Mudança de sistema", notes: "Verificar reversão", requesterPhone: "83999999999" }, { title: "Cancelamento", customer_id: "customer-id" });
  assert.equal(draft.title, "Cancelamento C260002 · Clínica");
  assert.equal(draft.customerId, "customer-id"); assert.equal(draft.customerCode, "250105");
  assert.equal(draft.clientWhatsApp, "83999999999"); assert.equal(draft.description, "Mudança de sistema\n\nVerificar reversão");
});
