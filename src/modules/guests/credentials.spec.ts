import {
  CODE_ALPHABET,
  newInvitationCode,
  newInvitationToken,
  normalizeCode,
  pickFreeCode,
} from './credentials';

describe('invitation credentials', () => {
  it('creates a 128-bit token with 22 base64url characters, different every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, newInvitationToken));

    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(16);
    }
  });

  it('creates 6-character codes only from the alphabet without 0, O, 1, I and L', () => {
    for (let i = 0; i < 200; i++) {
      const code = newInvitationCode();
      expect(code).toHaveLength(6);
      expect([...code].every((char) => CODE_ALPHABET.includes(char))).toBe(true);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it.each([
    [' k7m q2x ', 'K7MQ2X'],
    ['k7m-q2x', 'K7MQ2X'],
    ['K7MQ2X', 'K7MQ2X'],
    ['', ''],
  ])('normalizes the typed code %p to %p', (input, expected) => {
    expect(normalizeCode(input)).toBe(expected);
  });

  it('draws again while the code is already taken in the wedding', () => {
    const draw = jest
      .fn()
      .mockReturnValueOnce('AAAAAA')
      .mockReturnValueOnce('BBBBBB')
      .mockReturnValueOnce('CCCCCC');

    expect(pickFreeCode(new Set(['AAAAAA', 'BBBBBB']), draw)).toBe('CCCCCC');
    expect(draw).toHaveBeenCalledTimes(3);
  });

  it('never uses Math.random for credentials', () => {
    const random = jest.spyOn(Math, 'random');

    newInvitationToken();
    pickFreeCode(new Set());

    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
