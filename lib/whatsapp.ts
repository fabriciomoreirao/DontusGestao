export function whatsappNumber(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!value.trim().startsWith('+') && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}
export function desktopWhatsappUrl(value: string) { const number = whatsappNumber(value); return number ? `whatsapp://send?phone=${number}` : ''; }
