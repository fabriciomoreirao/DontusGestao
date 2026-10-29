import test from "node:test";
import assert from "node:assert/strict";
import { activeCatalogEntries, catalogFormValue } from "../lib/catalog-options.ts";

test("somente cadastros ativos da funcionalidade são oferecidos, sem opções fixas ou históricas", () => {
  const rows = [{ catalog:"serviceProblem",name:"Inativo",active:false }, { catalog:"serviceProblem",name:"Configurado",active:true },
    { catalog:"csUsage",name:"Outra funcionalidade",active:true }, { catalog:"serviceProblem",name:"  ",active:true }];
  assert.deepEqual(activeCatalogEntries(rows,"serviceProblem").map(entry=>entry.name),["Configurado"]);
  assert.deepEqual(activeCatalogEntries(rows,"ausente"),[]); assert.deepEqual(activeCatalogEntries([],"serviceProblem"),[]);
});

test("um cadastro inativo com o mesmo nome não oculta a opção ativa", () => {
  const rows = [{ catalog:"csFeature",name:"Agenda",active:false }, { catalog:"csFeatureBase",name:"Agénda",active:true },
    { catalog:"csFeaturePlus",name:"agenda",active:true }];
  assert.deepEqual(activeCatalogEntries(rows,["csFeature","csFeatureBase","csFeaturePlus"]).map(entry=>entry.catalog),["csFeatureBase"]);
  assert.equal(rows.length,3); assert.equal(rows[0].active,false);
});

test("editar outros dados preserva o valor histórico sem oferecê-lo como opção", () => {
  const rows = [{catalog:"status",name:"Antigo",active:false},{catalog:"status",name:"Novo",active:true}];
  assert.equal(catalogFormValue(rows,"status","Antigo",""),null);
  assert.equal(catalogFormValue(rows,"status","Excluído",""),null);
  assert.equal(catalogFormValue(rows,"status","Antigo","Novo"),"Novo");
  assert.equal(catalogFormValue(rows,"status","Novo",""),"");
  assert.deepEqual(activeCatalogEntries(rows,"status").map(entry=>entry.name),["Novo"]);
});
