import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../../common/auth/access.decorators';
import { PublicTenantGuard } from '../../common/tenant/public-tenant.guard';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { ShowcaseDto } from './dto/gift.dto';
import { GiftsService } from './gifts.service';

// Vitrine do site (spec 011 RF08): casamento pelo slug com site publicado, catálogo ao vivo.
@ApiTags('public-gifts')
@Public()
@UseGuards(PublicTenantGuard)
@ApiParam({ name: 'slug', type: String, required: true })
@Controller('public/sites/:slug/gifts')
export class PublicGiftsController {
  constructor(private readonly gifts: GiftsService) {}

  @Get()
  @ZodResponse({ status: 200, type: ShowcaseDto })
  showcase(@Tenant() tenant: TenantContext) {
    return this.gifts.getShowcase(tenant.weddingId);
  }
}
