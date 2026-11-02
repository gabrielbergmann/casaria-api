import { cpfDigits, isValidCpf, maskCpf } from './cpf';

describe('cpf', () => {
  it('accepts a CPF with valid check digits, with or without punctuation', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
  });

  it.each(['529.982.247-25', '52998224725', '111.444.777-35', '11144477735'])(
    'accepts the valid CPF %p (spec 015 RF05)',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(true);
    },
  );

  it.each([
    ['a wrong check digit', '529.982.247-24'],
    ['10 digits', '5299822472'],
    ['12 digits', '529982247250'],
    ['letters', '529.982.247-2a'],
    ['letters around valid digits', '52998224725x'],
    ['11 equal digits', '111.111.111-11'],
    ['nothing', ''],
  ])('refuses %s (spec 015 RF05)', (_case, cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });

  it('keeps only the last two digits in the mask', () => {
    expect(maskCpf(cpfDigits('529.982.247-25'))).toBe('***.***.***-25');
  });
});
