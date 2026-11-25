import test from "node:test";
import assert from "node:assert/strict";
import { followupValidationAccess } from "../lib/followup-validation.ts";

test("aprovação de acompanhamentos exige permissão específica de consulta e edição", () => {
  assert.deepEqual(
    followupValidationAccess({
      permissions: [{ screen: "lia", canView: true, canEdit: true }],
    }),
    { view: false, edit: false },
  );
  assert.deepEqual(
    followupValidationAccess({
      permissions: [
        { screen: "followupValidation", canView: true, canEdit: false },
      ],
    }),
    { view: true, edit: false },
  );
  assert.deepEqual(
    followupValidationAccess({
      permissions: [
        { screen: "followupValidation", canView: true, canEdit: true },
      ],
    }),
    { view: true, edit: true },
  );
  assert.deepEqual(followupValidationAccess({ fullAccess: true }), {
    view: true,
    edit: true,
  });
});
