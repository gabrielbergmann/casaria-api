import { Body, Controller, Delete, Get, HttpCode, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ZodResponse } from 'nestjs-zod';
import type { SessionUser } from '../../common/auth/session-user';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { PixKeyDto, PixKeyInputDto } from './dto/payments.dto';
import { PixKeysService } from './pix/pix-keys.service';

// Chave Pix do Pix direto em Configurações (spec 017 RF01 a RF03). Sem @Roles: só owner (PRD
// RF38); o editor recebe 403.
@ApiTags('payments')
@ApiWeddingParam()
@Controller('weddings/:weddingId/pix-key')
export class PixKeyController {
  constructor(private readonly pixKeys: PixKeysService) {}

  @Get()
  @ZodResponse({ status: 200, type: PixKeyDto })
  async get(@Tenant() tenant: TenantContext) {
    return { pixKey: await this.pixKeys.get(tenant.weddingId) };
  }

  @Put()
  @ZodResponse({ status: 200, type: PixKeyDto })
  async save(@Tenant() tenant: TenantContext, @Body() body: PixKeyInputDto, @Req() req: Request) {
    const user = req.user as SessionUser;
    return {
      pixKey: await this.pixKeys.save(tenant.weddingId, body.keyType, body.key, user.id),
    };
  }

  @Delete()
  @HttpCode(204)
  async remove(@Tenant() tenant: TenantContext, @Req() req: Request): Promise<void> {
    await this.pixKeys.remove(tenant.weddingId, (req.user as SessionUser).id);
  }
}
