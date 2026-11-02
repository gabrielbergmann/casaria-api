// Copia e cola do Pix direto (spec 017 ADR-002): Pix estático com valor no formato EMV do BR
// Code (Manual de Padrões para Iniciação do Pix, Banco Central). Cada campo é id + tamanho com
// dois dígitos + valor; o CRC16-CCITT fecha o código.

export interface DirectPixInput {
  key: string;
  amountCents: number;
  /** Nome do casal; vai sem acento e com até 25 caracteres. */
  merchantName: string;
  /** Id do pedido; vai só com letras e números, até 25 caracteres. */
  txid: string;
}

/** O banco do convidado mostra o titular real da chave; a cidade é só obrigatória no formato. */
const CITY = 'BRASIL';

/** Centavos → "105.26", sem passar por float. */
const amount = (cents: number) =>
  `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

const field = (id: string, value: string) =>
  `${id}${String(value.length).padStart(2, '0')}${value}`;

const ascii = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildDirectPixCode(input: DirectPixInput): string {
  const name = ascii(input.merchantName).slice(0, 25).trim() || 'CASAMENTO';
  const txid = input.txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const payload = [
    field('00', '01'),
    field('26', field('00', 'br.gov.bcb.pix') + field('01', input.key)),
    field('52', '0000'),
    field('53', '986'),
    field('54', amount(input.amountCents)),
    field('58', 'BR'),
    field('59', name),
    field('60', CITY),
    field('62', field('05', txid)),
    '6304',
  ].join('');
  return payload + crc16(payload);
}
