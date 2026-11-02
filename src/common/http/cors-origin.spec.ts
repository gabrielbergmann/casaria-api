import { buildCorsOrigin, isAllowedOrigin } from './cors-origin';

describe('isAllowedOrigin', () => {
  it.each(['https://app.casaria.test', 'https://ana-e-bia.casaria.test'])(
    'accepts %s in production',
    (origin) => {
      expect(isAllowedOrigin(origin, 'casaria.test', 'production')).toBe(true);
    },
  );

  it.each([
    'https://casaria.test.malicioso.com',
    'https://maliciosocasaria.test',
    'https://casaria.test',
    'https://a.b.casaria.test',
    'http://app.casaria.test',
    'https://app.casaria.test:8443',
    'null',
  ])('rejects %s in production', (origin) => {
    expect(isAllowedOrigin(origin, 'casaria.test', 'production')).toBe(false);
  });

  it('accepts http on any port only in development', () => {
    expect(isAllowedOrigin('http://app.localhost:5173', 'localhost', 'development')).toBe(true);
    expect(isAllowedOrigin('http://ana-e-bia.localhost:5173', 'localhost', 'development')).toBe(
      true,
    );
    expect(isAllowedOrigin('http://app.localhost:5173', 'localhost', 'production')).toBe(false);
    expect(isAllowedOrigin('http://app.localhost:5173', 'localhost', 'test')).toBe(false);
  });
});

describe('buildCorsOrigin', () => {
  const origin = buildCorsOrigin('casaria.test', 'production');

  it('lets requests without Origin through', () => {
    const callback = jest.fn();

    origin(undefined, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('denies a foreign origin', () => {
    const callback = jest.fn();

    origin('https://evil.example', callback);

    expect(callback).toHaveBeenCalledWith(null, false);
  });
});
