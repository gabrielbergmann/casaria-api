import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../common/auth/access.decorators';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { GiftDto, GiftInputDto, GiftListDto, GiftOrderDto } from './dto/gift.dto';
import { GiftsService } from './gifts.service';

// Catálogo no painel (spec 011): presentes são conteúdo, owner e editor (PRD RF38). A rota
// `order` vem antes de `:giftId` para o PUT não cair nela.
@ApiTags('gifts')
@ApiWeddingParam()
@Roles('owner', 'editor')
@Controller('weddings/:weddingId/gifts')
export class GiftsController {
  constructor(private readonly gifts: GiftsService) {}

  @Get()
  @ZodResponse({ status: 200, type: GiftListDto })
  async list(@Tenant() tenant: TenantContext) {
    return { gifts: await this.gifts.list(tenant.weddingId) };
  }

  @Post()
  @ZodResponse({ status: 201, type: GiftDto })
  create(@Tenant() tenant: TenantContext, @Body() body: GiftInputDto) {
    return this.gifts.create(tenant.weddingId, body);
  }

  @Put('order')
  @HttpCode(204)
  async reorder(@Tenant() tenant: TenantContext, @Body() body: GiftOrderDto): Promise<void> {
    await this.gifts.reorder(tenant.weddingId, body.giftIds);
  }

  @Put(':giftId')
  @ZodResponse({ status: 200, type: GiftDto })
  update(
    @Tenant() tenant: TenantContext,
    @Param('giftId') giftId: string,
    @Body() body: GiftInputDto,
  ) {
    return this.gifts.update(tenant.weddingId, giftId, body);
  }

  @Delete(':giftId')
  @HttpCode(204)
  async delete(@Tenant() tenant: TenantContext, @Param('giftId') giftId: string): Promise<void> {
    await this.gifts.delete(tenant.weddingId, giftId);
  }
}
