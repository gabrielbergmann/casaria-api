import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ZodResponse } from 'nestjs-zod';
import type { SessionUser } from '../../common/auth/session-user';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { PaymentFeesDto } from './dto/payments.dto';
import type { FeeTable } from './fees/payment-fees.repository';
import { PaymentFeesService } from './fees/payment-fees.service';

const toDto = (fees: FeeTable) => ({ pix: fees.PIX, card: fees.CARD });

// Taxas de Pix e cartão (spec 012 RF05): só owner (sem @Roles), auditadas.
@ApiTags('payments')
@ApiWeddingParam()
@Controller('weddings/:weddingId/payment-fees')
export class PaymentFeesController {
  constructor(private readonly fees: PaymentFeesService) {}

  @Get()
  @ZodResponse({ status: 200, type: PaymentFeesDto })
  async get(@Tenant() tenant: TenantContext) {
    return toDto(await this.fees.get(tenant.weddingId));
  }

  @Put()
  @ZodResponse({ status: 200, type: PaymentFeesDto })
  async save(@Tenant() tenant: TenantContext, @Body() body: PaymentFeesDto, @Req() req: Request) {
    const saved = await this.fees.save(
      tenant.weddingId,
      { PIX: body.pix, CARD: body.card },
      (req.user as SessionUser).id,
    );
    return toDto(saved);
  }
}
