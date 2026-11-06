export type SelectChoice = { value: string; label: string; description?: string; disabled?: boolean };
export const normalizeSelectSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
export function filterSelectChoices(choices: SelectChoice[], query: string) {
  const words=normalizeSelectSearch(query).split(/\s+/).filter(Boolean);
  return choices.filter(choice=>{const text=normalizeSelectSearch(`${choice.label} ${choice.description||''}`);return words.every(word=>text.includes(word))});
}
export function moveChoice(choices: SelectChoice[], current: number, direction: 1|-1) {
  if(!choices.length)return -1;
  for(let step=1;step<=choices.length;step++){const index=(current+direction*step+choices.length*2)%choices.length;if(!choices[index].disabled)return index}
  return -1;
}
