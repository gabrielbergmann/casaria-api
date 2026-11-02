import { Controller, Delete, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../common/auth/access.decorators';
import type { SessionUser } from '../../common/auth/session-user';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import {
  AwaitingGiftListDto,
  ReceivedGiftListDto,
  ReceivedGiftSummaryDto,
} from './dto/payments.dto';
import { DirectPixReviewService } from './received/direct-pix-review.service';
import { ReceivedGiftsService } from './received/received-gifts.service';
import { ThanksService } from './received/thanks.service';

// Recebidos (spec 012 RF14): a lista completa e a conferência do Pix direto (spec 017) são só do
// owner; a reduzida e o agradecido são de owner e editor (spec 014 RF07 a RF09).
@ApiTags('payments')
@ApiWeddingParam()
@Controller('weddings/:weddingId/received-gifts')
export class ReceivedGiftsController {
  constructor(
    private readonly received: ReceivedGiftsService,
    private readonly thanks: ThanksService,
    private readonly directPix: DirectPixReviewService,
  ) {}

  @Get()
  @ZodResponse({ status: 200, type: ReceivedGiftListDto })
  async list(@Tenant() tenant: TenantContext) {
    const items = await this.received.list(tenant.weddingId);
    return {
      items: items.map((item) => ({
        ...item,
        approvedAt: item.approvedAt.toISOString(),
        thankedAt: item.thankedAt?.toISOString() ?? null,
      })),
    };
  }

  @Get('awaiting')
  @ZodResponse({ status: 200, type: AwaitingGiftListDto })
  async listAwaiting(@Tenant() tenant: TenantContext) {
    const items = await this.received.listAwaiting(tenant.weddingId);
    return { items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) };
  }

  @Post(':orderId/confirm')
  @HttpCode(204)
  async confirm(
    @Tenant() tenant: TenantContext,
    @Param('orderId') orderId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.directPix.confirm(tenant.weddingId, orderId, (req.user as SessionUser).id);
  }

  @Post(':orderId/not-received')
  @HttpCode(204)
  async markNotReceived(
    @Tenant() tenant: TenantContext,
    @Param('orderId') orderId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.directPix.markNotReceived(tenant.weddingId, orderId, (req.user as SessionUser).id);
  }

  @Get('summary')
  @Roles('owner', 'editor')
  @ZodResponse({ status: 200, type: ReceivedGiftSummaryDto })
  async summary(@Tenant() tenant: TenantContext) {
    const { weddingDate, items } = await this.thanks.listForEditor(tenant.weddingId);
    return { weddingDate: weddingDate.toISOString(), items };
  }

  @Put(':orderId/thanked')
  @Roles('owner', 'editor')
  @HttpCode(204)
  async markThanked(
    @Tenant() tenant: TenantContext,
    @Param('orderId') orderId: string,
  ): Promise<void> {
    await this.thanks.mark(tenant.weddingId, orderId);
  }

  @Delete(':orderId/thanked')
  @Roles('owner', 'editor')
  @HttpCode(204)
  async unmarkThanked(
    @Tenant() tenant: TenantContext,
    @Param('orderId') orderId: string,
  ): Promise<void> {
    await this.thanks.unmark(tenant.weddingId, orderId);
  }
}
