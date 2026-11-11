type Catalog = {id:string;catalog:string;name:string;description:string;active:boolean};
export function crmLossReasonCatalog(crmId:string){return crmId?`commercialLossReason_${crmId.replace(/[^a-zA-Z0-9]/g,'')}`:'lossReason';}

/** Legacy options are inherited until the selected CRM overrides that name. */
export function crmLossReasons<T extends Catalog>(catalogs:readonly T[],crmId:string):Array<T&{inherited?:boolean}>{
  const key=crmLossReasonCatalog(crmId);
  if(key==='lossReason')return catalogs.filter(option=>option.catalog===key);
  const options=new Map<string,T&{inherited?:boolean}>();
  const normalized=(name:string)=>name.trim().toLocaleLowerCase('pt-BR');
  for(const option of catalogs)if(option.catalog==='lossReason')options.set(normalized(option.name),{...option,catalog:key,inherited:true});
  for(const option of catalogs)if(option.catalog===key){
    try{const previous=JSON.parse(option.description||'{}').inheritedName;if(typeof previous==='string')options.delete(normalized(previous));}catch{/* Older descriptions can be plain text. */}
    options.set(normalized(option.name),option);
  }
  return [...options.values()];
}

export function matchesCrmProduct(products:unknown,selected:string){
  return selected==='all'||Array.isArray(products)&&products.some(product=>product&&typeof product==='object'&&String(product.product||'')===selected);
}
