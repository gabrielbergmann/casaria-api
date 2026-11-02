import { z } from 'zod';
import { cpfDigits, isValidCpf } from '../../../common/personal-data/cpf';
import type { PixKeyType } from '../../../generated/prisma/enums';

// Chave Pix do casal (spec 017 RF01 e RF02): o tipo vem do casal, sem adivinhar (um CPF e um
// celular têm os mesmos 11 dígitos). Guardada como o banco espera ler no copia e cola.

const digits = (raw: string) => raw.replace(/\D/g, '');

function isValidCnpj(value: string): boolean {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const checkDigit = (length: number) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return checkDigit(12) === Number(value[12]) && checkDigit(13) === Number(value[13]);
}

/** Celular com DDD (11 dígitos, nono dígito 9), com ou sem +55, vira +55DDNNNNNNNNN. */
function normalizePhone(raw: string): string | null {
  if (!/^[\d\s()+.-]+$/.test(raw)) return null;
  let value = digits(raw);
  if (value.length === 13 && value.startsWith('55')) value = value.slice(2);
  return /^[1-9]\d9\d{8}$/.test(value) ? `+55${value}` : null;
}

/** Chave normalizada ou null quando inválida para o tipo. */
export function normalizePixKey(type: PixKeyType, raw: string): string | null {
  const value = raw.trim();
  switch (type) {
    case 'CPF':
      return isValidCpf(value) ? cpfDigits(value) : null;
    case 'CNPJ':
      return /^[\d\s./-]+$/.test(value) && isValidCnpj(digits(value)) ? digits(value) : null;
    case 'PHONE':
      return normalizePhone(value);
    case 'EMAIL': {
      const email = value.toLowerCase();
      return email.length <= 77 && z.email().safeParse(email).success ? email : null;
    }
    case 'RANDOM': {
      const key = value.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key)
        ? key
        : null;
    }
  }
}
