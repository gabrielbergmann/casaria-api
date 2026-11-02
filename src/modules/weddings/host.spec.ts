import { classifyHost } from './host';

describe('classifyHost', () => {
  it.each([
    ['app.casaria.test', { kind: 'panel' }],
    ['api.casaria.test', { kind: 'api' }],
    ['casaria.test', { kind: 'root' }],
    ['www.casaria.test', { kind: 'root' }],
    ['ana-e-bia.casaria.test', { kind: 'site', slug: 'ana-e-bia' }],
    ['ANA-E-BIA.casaria.test:443', { kind: 'site', slug: 'ana-e-bia' }],
    ['admin.casaria.test', { kind: 'unknown' }],
    ['ana_bia.casaria.test', { kind: 'unknown' }],
    ['a.b.casaria.test', { kind: 'unknown' }],
    ['outro.com', { kind: 'unknown' }],
    ['casaria.test.outro.com', { kind: 'unknown' }],
    ['192.168.0.10', { kind: 'unknown' }],
    ['', { kind: 'unknown' }],
  ])('classifies %s', (host, expected) => {
    expect(classifyHost(host, 'casaria.test')).toEqual(expected);
  });
});
