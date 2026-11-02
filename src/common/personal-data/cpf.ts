// CPF do pagador (skill dados-pessoais §1): só dígitos, validados pelos verificadores, gravados
// cifrados e exibidos mascarados.

/** "123.456.789-09" → "12345678909". */
export const cpfDigits = (raw: string) => raw.replace(/\D/g, '');

/** Só dígitos, com a pontuação opcional do formato 000.000.000-00; letras são recusadas. */
const CPF_CHARS = /^[\d.\s-]+$/;

export function isValidCpf(raw: string): boolean {
  if (!CPF_CHARS.test(raw)) return false;
  const digits = cpfDigits(raw);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const checkDigit = (length: number) => {
    const sum = [...digits.slice(0, length)].reduce(
      (total, digit, index) => total + Number(digit) * (length + 1 - index),
      0,
    );
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

export const maskCpf = (digits: string) => `***.***.***-${digits.slice(-2)}`;
