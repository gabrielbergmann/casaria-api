import { normalizePixKey } from './pix-key';

describe('normalizePixKey (spec 017 RF02)', () => {
  it.each([
    ['CPF', '529.982.247-25', '52998224725'],
    ['CNPJ', '11.222.333/0001-81', '11222333000181'],
    ['PHONE', '(47) 99123-4567', '+5547991234567'],
    ['PHONE', '+55 47 99123-4567', '+5547991234567'],
    ['EMAIL', ' Casal@Example.com ', 'casal@example.com'],
    ['RANDOM', '123E4567-E12B-12D1-A456-426655440000', '123e4567-e12b-12d1-a456-426655440000'],
  ] as const)('keeps a valid %s as the bank reads it', (type, raw, expected) => {
    expect(normalizePixKey(type, raw)).toBe(expected);
  });

  it.each([
    ['CPF', '529.982.247-26'],
    ['CPF', 'casal@example.com'],
    ['CNPJ', '11.222.333/0001-82'],
    ['PHONE', '(47) 3333-4444'],
    ['PHONE', '52998224725x'],
    ['EMAIL', 'casal@'],
    ['EMAIL', `${'a'.repeat(70)}@example.com`],
    ['RANDOM', 'not-a-uuid'],
  ] as const)('refuses an invalid %s', (type, raw) => {
    expect(normalizePixKey(type, raw)).toBeNull();
  });
});
