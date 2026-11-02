import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookSignatureInput } from '../../modules/payments/provider/payment-provider';

/** ts com mais de 5 minutos de diferença do relógio é recusado (spec 012 RF12). */
const MAX_AGE_MS = 5 * 60_000;

function parseSignature(header: string): { ts?: string; v1?: string } {
  return Object.fromEntries(
    header.split(',').map((part) => {
      const [key, ...value] = part.split('=');
      return [key.trim(), value.join('=').trim()];
    }),
  );
}

/** O Mercado Pago manda ts em segundos ou em milissegundos, conforme o produto. */
const tsToMs = (ts: string) => (ts.length >= 13 ? Number(ts) : Number(ts) * 1000);

/**
 * Assinatura das notificações (documentação "Validar a origem da notificação"): HMAC-SHA256 da
 * chave secreta sobre "id:{data.id};request-id:{x-request-id};ts:{ts};", com o data.id
 * alfanumérico em minúsculas, comparado em tempo constante.
 */
export function verifyMercadoPagoSignature(secret: string, input: WebhookSignatureInput): boolean {
  if (!input.signature || !input.requestId || !input.dataId) return false;
  const { ts, v1 } = parseSignature(input.signature);
  if (!ts || !/^\d{10,13}$/.test(ts) || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  if (Math.abs(input.now.getTime() - tsToMs(ts)) > MAX_AGE_MS) return false;

  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(v1, 'hex'));
}
