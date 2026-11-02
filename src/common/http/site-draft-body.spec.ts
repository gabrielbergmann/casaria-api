import type { IncomingMessage } from 'node:http';
import { isSiteDraftJson } from './site-draft-body';

const request = (method: string, url: string, contentType = 'application/json') =>
  ({ method, url, headers: { 'content-type': contentType } }) as unknown as IncomingMessage;

describe('isSiteDraftJson', () => {
  it('matches the JSON PUT of the site draft', () => {
    expect(isSiteDraftJson(request('PUT', '/v1/weddings/0199-a/site/draft'))).toBe(true);
    expect(
      isSiteDraftJson(
        request('PUT', '/v1/weddings/0199-a/site/draft?x=1', 'application/json; charset=utf-8'),
      ),
    ).toBe(true);
  });

  it.each([
    ['POST', '/v1/weddings/0199-a/site/draft', 'application/json'],
    ['PUT', '/v1/weddings/0199-a/site/publish', 'application/json'],
    ['PUT', '/v1/weddings/0199-a/site/draft/x', 'application/json'],
    ['PUT', '/v1/weddings/0199-a/site/draft', 'text/plain'],
    ['PATCH', '/v1/weddings/0199-a', 'application/json'],
  ])('keeps the default limit for %s %s (%s)', (method, url, contentType) => {
    expect(isSiteDraftJson(request(method, url, contentType))).toBe(false);
  });
});
