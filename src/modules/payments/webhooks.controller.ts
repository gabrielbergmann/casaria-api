import { Body, Controller, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/auth/access.decorators';
import { MercadoPagoWebhookService } from './webhooks/mercadopago-webhook.service';

const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;

const field = (source: unknown, key: string) =>
  typeof source === 'object' && source !== null
    ? (source as Record<string, unknown>)[key]
    : undefined;

// Notificações do Mercado Pago (spec 012 RF11, RF12, RF03): URL única da aplicação, sem sessão.
// Erro → status não 2xx → o Mercado Pago reenvia. Fora do OpenAPI: o front não a chama.
@ApiExcludeController()
@Public()
@Controller('webhooks/mercadopago')
export class WebhooksController {
  constructor(private readonly webhooks: MercadoPagoWebhookService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ): Promise<void> {
    await this.webhooks.handle({
      signature,
      requestId,
      // A assinatura cobre o data.id da query (com o parser estendido, ele vira query.data.id).
      dataId: text(query['data.id']) ?? text(field(query.data, 'id')),
      type: text(query.type) ?? text(field(body, 'type')),
      action: text(field(body, 'action')),
      userId: text(field(body, 'user_id')),
    });
  }
}
