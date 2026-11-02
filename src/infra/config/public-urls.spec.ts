import { apiOrigin, isPanelOrigin, panelOrigin, siteOrigin } from './public-urls';

describe('public urls', () => {
  const production = { NODE_ENV: 'production', APP_DOMAIN: 'casaria.test' } as const;
  const development = { NODE_ENV: 'development', APP_DOMAIN: 'localhost' } as const;

  it('derives the panel and api origins from APP_DOMAIN', () => {
    expect(panelOrigin(production)).toBe('https://app.casaria.test');
    expect(apiOrigin(production)).toBe('https://api.casaria.test');
    expect(panelOrigin(development)).toBe('http://app.localhost:5173');
    expect(apiOrigin(development)).toBe('http://app.localhost:5173');
  });

  it('derives the site origin of a wedding from its slug', () => {
    expect(siteOrigin(production, 'ana-e-bia')).toBe('https://ana-e-bia.casaria.test');
    expect(siteOrigin(development, 'ana-e-bia')).toBe('http://ana-e-bia.localhost:5173');
  });

  it.each([
    [undefined, false],
    ['https://app.casaria.test', true],
    ['https://ana-e-bia.casaria.test', false],
    ['http://app.casaria.test', false],
    ['https://app.casaria.test.evil.com', false],
  ])('checks the panel Origin %s in production', (origin, expected) => {
    expect(isPanelOrigin(origin, production)).toBe(expected);
  });

  it('accepts the panel on any port in development', () => {
    expect(isPanelOrigin('http://app.localhost:5174', development)).toBe(true);
    expect(isPanelOrigin('http://ana-e-bia.localhost:5173', development)).toBe(false);
  });

  it('uses DEV_PANEL_URL as the panel and api origin in development only', () => {
    const tunnel = 'https://casaria-dev.ngrok-free.dev';
    expect(panelOrigin({ ...development, DEV_PANEL_URL: tunnel })).toBe(tunnel);
    expect(apiOrigin({ ...development, DEV_PANEL_URL: tunnel })).toBe(tunnel);
    expect(isPanelOrigin(tunnel, { ...development, DEV_PANEL_URL: tunnel })).toBe(true);
    expect(isPanelOrigin(tunnel, development)).toBe(false);
    expect(panelOrigin({ ...production, DEV_PANEL_URL: tunnel })).toBe('https://app.casaria.test');
    expect(isPanelOrigin(tunnel, { ...production, DEV_PANEL_URL: tunnel })).toBe(false);
  });
});
