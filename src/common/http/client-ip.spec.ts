import type { Request, Response } from 'express';
import { clientIpFromHeader } from './client-ip';

const run = (headers: Record<string, string | string[]>) => {
  const req = { headers, ip: '172.70.0.1', ips: ['172.70.0.1'] } as unknown as Request;
  const next = jest.fn();
  clientIpFromHeader('CF-Connecting-IP')(req, {} as Response, next);
  return { req, next };
};

describe('clientIpFromHeader', () => {
  it('takes the visitor IP from the edge header for req.ip and req.ips', () => {
    const { req, next } = run({ 'cf-connecting-ip': '200.1.2.3' });

    expect(req.ip).toBe('200.1.2.3');
    expect(req.ips).toEqual(['200.1.2.3']);
    expect(next).toHaveBeenCalled();
  });

  it('uses the first address of a list', () => {
    expect(run({ 'cf-connecting-ip': '200.1.2.3, 10.0.0.1' }).req.ip).toBe('200.1.2.3');
  });

  it('keeps the Express IP without the header', () => {
    const { req, next } = run({});

    expect(req.ip).toBe('172.70.0.1');
    expect(next).toHaveBeenCalled();
  });
});
