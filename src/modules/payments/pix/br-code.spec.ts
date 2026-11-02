import { buildDirectPixCode, crc16 } from './br-code';

const ORDER_ID = '0199f1a1-0000-7000-8000-0000000000a1';

describe('BR Code do Pix direto (spec 017 ADR-002)', () => {
  it('matches the CRC of the example in the Pix manual of the Banco Central', () => {
    const payload =
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000' +
      '5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';

    expect(crc16(payload)).toBe('1D3D');
  });

  it('builds the copy and paste with the key, the amount, the couple name and a valid CRC', () => {
    const code = buildDirectPixCode({
      key: 'casal@example.com',
      amountCents: 10_526,
      merchantName: 'Ana & Bia — Casamento',
      txid: ORDER_ID,
    });

    expect(code).toBe(
      '000201' +
        '26390014br.gov.bcb.pix0117casal@example.com' +
        '52040000' +
        '5303986' +
        '5406105.26' +
        '5802BR' +
        '5917Ana Bia Casamento' +
        '6006BRASIL' +
        '62290525' +
        '0199f1a10000700080000000' +
        '0' +
        '6304' +
        code.slice(-4),
    );
    expect(crc16(code.slice(0, -4))).toBe(code.slice(-4));
  });

  it('cuts the name at 25 characters and keeps cents below one real', () => {
    const code = buildDirectPixCode({
      key: '+5547991234567',
      amountCents: 7,
      merchantName: 'Maria Eduarda Albuquerque & Gabriel',
      txid: ORDER_ID,
    });

    expect(code).toContain('54040.07');
    expect(code).toContain('5925Maria Eduarda Albuquerque6006');
  });
});
