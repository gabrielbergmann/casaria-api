import type { Request } from 'express';

// Rotas do painel de um casamento: /v1/weddings/:weddingId e abaixo.
const PANEL_ROUTE = /^\/v\d+\/weddings\/:weddingId(?:\/|$)/;

export const isPanelWeddingRoute = (req: Pick<Request, 'route'>) =>
  PANEL_ROUTE.test(req.route?.path ?? '');
