import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../common/auth/access.decorators';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { PanelSiteDto, PublishedSiteDto, SiteConfigDto } from './dto/site.dto';
import { type PanelSite, SiteService } from './site.service';

const toDto = (site: PanelSite) => ({
  ...site,
  publishedAt: site.publishedAt?.toISOString() ?? null,
  updatedAt: site.updatedAt?.toISOString() ?? null,
  weddingDate: site.weddingDate.toISOString(),
});

// Site é conteúdo: owner e editor (PRD RF38). Escritas exigem o Origin do painel (spec 004).
@ApiTags('site')
@ApiWeddingParam()
@Roles('owner', 'editor')
@Controller('weddings/:weddingId/site')
export class SiteController {
  constructor(private readonly site: SiteService) {}

  @Get()
  @ZodResponse({ status: 200, type: PanelSiteDto })
  async get(@Tenant() tenant: TenantContext) {
    return toDto(await this.site.getForPanel(tenant.weddingId));
  }

  // Sem DTO no parâmetro: o service valida e responde 413 ou 422 com os campos (RF08).
  @Put('draft')
  @ApiBody({ type: SiteConfigDto })
  @ZodResponse({ status: 200, type: PanelSiteDto })
  async saveDraft(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    return toDto(await this.site.saveDraft(tenant.weddingId, body));
  }

  @Post('publish')
  @ZodResponse({ status: 200, type: PublishedSiteDto })
  async publish(@Tenant() tenant: TenantContext) {
    const { publishedAt } = await this.site.publish(tenant.weddingId);
    return { publishedAt: publishedAt.toISOString() };
  }
}
