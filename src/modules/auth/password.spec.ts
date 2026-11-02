import { hashPassword, PasswordSchema, verifyPassword } from './password';

describe('PasswordSchema', () => {
  it('accepts 10 characters or more', () => {
    expect(PasswordSchema.safeParse('a'.repeat(10)).success).toBe(true);
  });

  it('rejects 9 characters', () => {
    expect(PasswordSchema.safeParse('a'.repeat(9)).success).toBe(false);
  });

  it('rejects more than 72 bytes even with few characters', () => {
    const password = 'é'.repeat(37); // 37 caracteres, 74 bytes

    expect(PasswordSchema.safeParse(password).success).toBe(false);
    expect(PasswordSchema.safeParse('a'.repeat(72)).success).toBe(true);
  });
});

describe('hashPassword and verifyPassword', () => {
  it('stores only a bcrypt hash with cost 12 that verifies the original', async () => {
    const hash = await hashPassword('uma-senha-longa');

    expect(hash).toMatch(/^\$2b\$12\$/);
    expect(hash).not.toContain('uma-senha-longa');
    await expect(verifyPassword('uma-senha-longa', hash)).resolves.toBe(true);
    await expect(verifyPassword('outra-senha-longa', hash)).resolves.toBe(false);
  });

  it('never verifies a user without password', async () => {
    await expect(verifyPassword('qualquer-senha', null)).resolves.toBe(false);
  });
});
