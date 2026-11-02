import { Body, Controller, Delete, Get, HttpCode, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { UpdateWeddingDto, WeddingDetailsDto } from './dto/wedding.dto';
import type { WeddingDetails } from './weddings.repository';
import { WeddingsService } from './weddings.service';

const toDto = (details: WeddingDetails) => ({
  coupleName: details.coupleName,
  weddingDate: details.weddingDate.toISOString(),
  slug: details.slug,
});

// Configurações do casamento: sem @Roles, só o owner (PRD RF38, RF45).
@ApiTags('weddings')
@ApiWeddingParam()
@Controller('weddings/:weddingId')
export class WeddingsController {
  constructor(private readonly weddings: WeddingsService) {}

  @Get()
  @ZodResponse({ status: 200, type: WeddingDetailsDto })
  async get(@Tenant() tenant: TenantContext) {
    return toDto(await this.weddings.getDetails(tenant.weddingId));
  }

  @Patch()
  @ZodResponse({ status: 200, type: WeddingDetailsDto })
  async update(@Tenant() tenant: TenantContext, @Body() body: UpdateWeddingDto) {
    const details = await this.weddings.update(tenant.weddingId, {
      coupleName: body.coupleName,
      weddingDate: body.weddingDate === undefined ? undefined : new Date(body.weddingDate),
      slug: body.slug,
    });
    return toDto(details);
  }

  @Delete()
  @HttpCode(204)
  async delete(@Tenant() tenant: TenantContext): Promise<void> {
    await this.weddings.delete(tenant.weddingId);
  }
}
