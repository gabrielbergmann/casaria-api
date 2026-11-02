import type { NextFunction, Request, Response } from 'express';

/**
 * IP do visitante a partir do cabeçalho do proxy da borda (CLIENT_IP_HEADER). Substitui req.ip e
 * req.ips, que o throttler e o bloqueio de login usam; sem o cabeçalho, nada muda.
 */
export function clientIpFromHeader(header: string) {
  const name = header.toLowerCase();
  return (req: Request, _res: Response, next: NextFunction) => {
    const raw = req.headers[name];
    const ip = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
    if (ip) {
      Object.defineProperty(req, 'ip', { value: ip, configurable: true });
      Object.defineProperty(req, 'ips', { value: [ip], configurable: true });
    }
    next();
  };
}
