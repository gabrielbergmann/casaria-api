import { isValidSlug, RESERVED_SLUGS } from './slug';

describe('isValidSlug', () => {
  it.each(['abc', 'ana-e-bia', 'a1b', 'x'.repeat(63)])('accepts %s', (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each(['ab', 'x'.repeat(64), 'Ana', 'ana_bia', 'ána', '-ana', 'ana-', 'ana--bia', 'ana bia'])(
    'rejects %s',
    (slug) => {
      expect(isValidSlug(slug)).toBe(false);
    },
  );

  it.each([...RESERVED_SLUGS])('rejects the reserved slug %s', (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });

  it('reserves exactly the slugs of PRD RF03 and the production infrastructure', () => {
    expect([...RESERVED_SLUGS].sort()).toEqual(
      [
        'admin',
        'api',
        'app',
        'assets',
        'blog',
        'cdn',
        'files',
        'help',
        'infra',
        'mail',
        'static',
        'status',
        'www',
      ].sort(),
    );
  });
});
