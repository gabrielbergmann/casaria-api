import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../../common/auth/access.decorators';
import { PublicTenantGuard } from '../../common/tenant/public-tenant.guard';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { WeddingNotFound } from '../weddings/errors/wedding-not-found';
import { PublicSiteDto } from './dto/site.dto';
import { SiteService } from './site.service';

// Site público pelo slug do host (spec 007 RF01, RF05): só a versão publicada.
@ApiTags('public-site')
@Public()
@UseGuards(PublicTenantGuard)
@ApiParam({ name: 'slug', type: String, required: true })
@Controller('public/sites/:slug')
export class PublicSiteController {
  constructor(private readonly site: SiteService) {}

  @Get()
  @ZodResponse({ status: 200, type: PublicSiteDto })
  async get(@Tenant() tenant: TenantContext) {
    const site = await this.site.getPublic(tenant.weddingId);
    if (!site) throw new WeddingNotFound();
    return { ...site, weddingDate: site.weddingDate.toISOString() };
  }
}
