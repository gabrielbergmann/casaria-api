import { randomBytes, randomInt } from 'node:crypto';

/** Sem 0/O e 1/I/L, para o código ser lido e digitado sem confusão. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** 128 bits em base64url (22 caracteres), usado só no fragmento do link (#convite=). */
export const newInvitationToken = () => randomBytes(16).toString('base64url');

export const newInvitationCode = () =>
  Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(
    '',
  );

/** " k7m q2x " → "K7MQ2X": o convidado digita com espaços, hífens ou minúsculas. */
export const normalizeCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Sorteia de novo enquanto o código já estiver em uso no casamento (spec 009 RF11). */
export function pickFreeCode(taken: ReadonlySet<string>, draw = newInvitationCode): string {
  let code = draw();
  while (taken.has(code)) code = draw();
  return code;
}
