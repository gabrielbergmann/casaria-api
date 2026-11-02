import { Controller, Delete, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ZodResponse } from 'nestjs-zod';
import type { SessionUser } from '../../common/auth/session-user';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { PaymentAccountsService } from './accounts/payment-accounts.service';
import { AuthorizationUrlDto, PaymentAccountDto } from './dto/payments.dto';

const iso = (date: Date | null) => date?.toISOString() ?? null;

// Conta Mercado Pago em Configurações (spec 012 RF01 a RF04). Sem @Roles: só owner (PRD RF38);
// o editor recebe 403.
@ApiTags('payments')
@ApiWeddingParam()
@Controller('weddings/:weddingId/payment-account')
export class PaymentAccountController {
  constructor(private readonly accounts: PaymentAccountsService) {}

  @Get()
  @ZodResponse({ status: 200, type: PaymentAccountDto })
  async get(@Tenant() tenant: TenantContext) {
    const status = await this.accounts.getStatus(tenant.weddingId);
    return {
      ...status,
      connectedAt: iso(status.connectedAt),
      disconnectedAt: iso(status.disconnectedAt),
    };
  }

  /** Devolve a URL do Mercado Pago; o painel navega para ela. */
  @Post('connect')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AuthorizationUrlDto })
  connect(@Tenant() tenant: TenantContext, @Req() req: Request) {
    const user = req.user as SessionUser;
    return {
      authorizationUrl: this.accounts.startConnection(req.session, tenant.weddingId, user.id),
    };
  }

  @Delete()
  @HttpCode(204)
  async disconnect(@Tenant() tenant: TenantContext, @Req() req: Request): Promise<void> {
    await this.accounts.disconnectByOwner(tenant.weddingId, (req.user as SessionUser).id);
  }
}
