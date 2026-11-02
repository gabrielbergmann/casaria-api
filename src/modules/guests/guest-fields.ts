import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { z } from 'zod';

// Campos de convite e pessoa (spec 009 RF01, RF03), os mesmos no painel e na planilha: mensagens
// em pt-BR que dizem como corrigir.
export const NAME_ERROR = 'Informe o nome.';
export const NAME_TOO_LONG_ERROR = 'Use até 120 caracteres.';
export const PHONE_ERROR = 'Telefone inválido. Informe DDD e número, como (11) 99999-0000.';
export const EMAIL_ERROR = 'Email inválido. Use o formato nome@exemplo.com.';
export const COMPANIONS_ERROR = 'Informe um número inteiro igual ou maior que 0.';

const emailFormat = z.email();

/** "(11) 99999-0000" → "+5511999990000"; inválido → null. Região padrão BR. */
export function toE164(raw: string): string | null {
  const phone = parsePhoneNumberFromString(raw, 'BR');
  return phone?.isValid() ? phone.number : null;
}

export const isValidEmail = (email: string) => emailFormat.safeParse(email).success;

export const NameField = z
  .string()
  .trim()
  .min(1, { error: NAME_ERROR })
  .max(120, { error: NAME_TOO_LONG_ERROR });

/** Vazio ou null apaga; ausente mantém (edição). Gravado em E.164. */
export const PhoneField = z
  .string()
  .trim()
  .max(40, { error: PHONE_ERROR })
  .refine((value) => value === '' || toE164(value) !== null, { error: PHONE_ERROR })
  .transform((value) => (value === '' ? null : toE164(value)))
  .nullish();

/** Vazio ou null apaga; ausente mantém (edição). Gravado em minúsculas. */
export const EmailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { error: EMAIL_ERROR })
  .refine((value) => value === '' || isValidEmail(value), { error: EMAIL_ERROR })
  .transform((value) => value || null)
  .nullish();

export const MaxCompanionsField = z
  .int({ error: COMPANIONS_ERROR })
  .min(0, { error: COMPANIONS_ERROR })
  .max(999, { error: 'Use até 999 acompanhantes.' });
