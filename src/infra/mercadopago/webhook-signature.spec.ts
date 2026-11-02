import { createHmac } from 'node:crypto';
import { verifyMercadoPagoSignature } from './webhook-signature';

const SECRET = 'mp-webhook-secret';
const NOW = new Date('2027-03-01T12:00:00.000Z');
const TS = String(Math.floor(NOW.getTime() / 1000));

const sign = (manifest: string, secret = SECRET) =>
  createHmac('sha256', secret).update(manifest).digest('hex');

const input = (overrides: Record<string, unknown> = {}) => ({
  signature: `ts=${TS},v1=${sign(`id:ord01jq4s4ky8hwq6na5pxb65b3d3;request-id:req-1;ts:${TS};`)}`,
  requestId: 'req-1',
  dataId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3',
  now: NOW,
  ...overrides,
});

describe('verifyMercadoPagoSignature', () => {
  it('accepts the documented manifest with the alphanumeric data.id in lowercase', () => {
    expect(verifyMercadoPagoSignature(SECRET, input())).toBe(true);
  });

  it('accepts ts in milliseconds', () => {
    const ts = String(NOW.getTime());
    const v1 = sign(`id:ord01jq4s4ky8hwq6na5pxb65b3d3;request-id:req-1;ts:${ts};`);

    expect(verifyMercadoPagoSignature(SECRET, input({ signature: `ts=${ts},v1=${v1}` }))).toBe(
      true,
    );
  });

  it('refuses a signature made with another secret or for another resource', () => {
    expect(verifyMercadoPagoSignature('other-secret', input())).toBe(false);
    expect(verifyMercadoPagoSignature(SECRET, input({ dataId: 'ORD-OUTRO' }))).toBe(false);
    expect(verifyMercadoPagoSignature(SECRET, input({ requestId: 'req-2' }))).toBe(false);
  });

  it('refuses a missing or malformed header', () => {
    expect(verifyMercadoPagoSignature(SECRET, input({ signature: undefined }))).toBe(false);
    expect(verifyMercadoPagoSignature(SECRET, input({ signature: 'ts=1,v1=abc' }))).toBe(false);
    expect(verifyMercadoPagoSignature(SECRET, input({ requestId: undefined }))).toBe(false);
  });

  it('refuses a ts more than 5 minutes away from now', () => {
    const late = new Date(NOW.getTime() + 5 * 60_000 + 1_000);
    const inTime = new Date(NOW.getTime() + 4 * 60_000);

    expect(verifyMercadoPagoSignature(SECRET, input({ now: late }))).toBe(false);
    expect(verifyMercadoPagoSignature(SECRET, input({ now: inTime }))).toBe(true);
  });
});
