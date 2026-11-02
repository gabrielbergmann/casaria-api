import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../../common/auth/access.decorators';
import { PublicTenantGuard } from '../../common/tenant/public-tenant.guard';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import {
  CardPaymentDto,
  CheckoutAvailabilityDto,
  CreatedOrderDto,
  CreateOrderDto,
  PublicOrderDto,
  QuoteDto,
  QuoteInputDto,
} from './dto/payments.dto';
import { CheckoutService } from './orders/checkout.service';

/** 10 pedidos a cada 10 minutos por IP (spec 012 RNF01), também no envio do cartão. */
const ORDER_LIMIT = { default: { limit: 10, ttl: minutes(10) } };

// Checkout do site (spec 012 RF06 a RF10): casamento pelo slug com site publicado, sem login.
@ApiTags('public-checkout')
@Public()
@UseGuards(PublicTenantGuard)
@ApiParam({ name: 'slug', type: String, required: true })
@Controller('public/sites/:slug')
export class PublicCheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /** Sem chave Pix nem conta válida, o site mostra os presentes sem compra (RF04, 017 RF05). */
  @Get('checkout')
  @ZodResponse({ status: 200, type: CheckoutAvailabilityDto })
  async availability(@Tenant() tenant: TenantContext) {
    const methods = await this.checkout.availability(tenant.weddingId);
    return { checkoutAvailable: methods.pix || methods.card, ...methods };
  }

  @Post('checkout/quote')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: QuoteDto })
  quote(@Tenant() tenant: TenantContext, @Body() body: QuoteInputDto) {
    return this.checkout.quote(tenant.weddingId, body.giftId, {
      quantity: body.quantity,
      amountCents: body.amountCents,
    });
  }

  @Post('orders')
  @Throttle(ORDER_LIMIT)
  @ZodResponse({ status: 201, type: CreatedOrderDto })
  async createOrder(@Tenant() tenant: TenantContext, @Body() body: CreateOrderDto) {
    const order = await this.checkout.createOrder(tenant.weddingId, body);
    return { ...order, reservationExpiresAt: order.reservationExpiresAt.toISOString() };
  }

  @Post('orders/:orderId/card-payment')
  @HttpCode(200)
  @Throttle(ORDER_LIMIT)
  @ZodResponse({ status: 200, type: PublicOrderDto })
  async payWithCard(
    @Tenant() tenant: TenantContext,
    @Param('orderId') orderId: string,
    @Body() body: CardPaymentDto,
  ) {
    await this.checkout.payWithCard(tenant.weddingId, orderId, {
      ...body,
      issuerId: body.issuerId ?? null,
    });
    return this.checkout.getPublicOrder(tenant.weddingId, orderId);
  }

  /** "Já fiz o Pix" no Pix direto (spec 017 RF07). */
  @Post('orders/:orderId/pix-sent')
  @HttpCode(200)
  @Throttle(ORDER_LIMIT)
  @ZodResponse({ status: 200, type: PublicOrderDto })
  declarePixSent(@Tenant() tenant: TenantContext, @Param('orderId') orderId: string) {
    return this.checkout.declarePixSent(tenant.weddingId, orderId);
  }

  @Get('orders/:orderId')
  @ZodResponse({ status: 200, type: PublicOrderDto })
  getOrder(@Tenant() tenant: TenantContext, @Param('orderId') orderId: string) {
    return this.checkout.getPublicOrder(tenant.weddingId, orderId);
  }
}
