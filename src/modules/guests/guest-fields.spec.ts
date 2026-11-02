import { z } from 'zod';
import { EmailField, MaxCompanionsField, NameField, PhoneField, toE164 } from './guest-fields';

describe('guest fields', () => {
  it.each([
    ['(11) 99999-0000', '+5511999990000'],
    ['11 3333-4444', '+551133334444'],
    ['+351 912 345 678', '+351912345678'],
    ['1199', null],
    ['(11) 9999-0000', null],
    ['abc', null],
  ])('stores the phone %p as %p in E.164', (raw, expected) => {
    expect(toE164(raw)).toBe(expected);
  });

  const Person = z.object({
    name: NameField,
    phone: PhoneField,
    email: EmailField,
    maxCompanions: MaxCompanionsField.default(0),
  });

  it('normalizes "(11) 99999-0000" and "Ana@Example.com" and defaults the limit to 0', () => {
    expect(
      Person.parse({ name: ' Ana ', phone: '(11) 99999-0000', email: ' Ana@Example.com ' }),
    ).toEqual({
      name: 'Ana',
      phone: '+5511999990000',
      email: 'ana@example.com',
      maxCompanions: 0,
    });
  });

  it('turns empty contacts into null and keeps absent ones absent', () => {
    expect(Person.parse({ name: 'Ana', phone: '', email: ' ' })).toMatchObject({
      phone: null,
      email: null,
    });
    const parsed = Person.parse({ name: 'Ana' });
    expect(parsed.phone).toBeUndefined();
    expect(parsed.email).toBeUndefined();
  });

  it.each([
    [{ phone: '1199' }, 'phone', 'Telefone inválido. Informe DDD e número, como (11) 99999-0000.'],
    [{ email: 'ana@' }, 'email', 'Email inválido. Use o formato nome@exemplo.com.'],
    [{ maxCompanions: -1 }, 'maxCompanions', 'Informe um número inteiro igual ou maior que 0.'],
    [{ maxCompanions: 1.5 }, 'maxCompanions', 'Informe um número inteiro igual ou maior que 0.'],
    [{ name: '  ' }, 'name', 'Informe o nome.'],
    [{ name: 'a'.repeat(121) }, 'name', 'Use até 120 caracteres.'],
  ])('rejects %p with the field and a pt-BR message', (input, path, message) => {
    const result = Person.safeParse({ name: 'Ana', ...input });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: [path], message })]);
  });
});
