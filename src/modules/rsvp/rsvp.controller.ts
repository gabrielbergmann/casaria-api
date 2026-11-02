import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../common/auth/access.decorators';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import {
  ExportQueryDto,
  ListPeopleQueryDto,
  OpenResponsesPageDto,
  PageQueryDto,
  RsvpPeoplePageDto,
  RsvpSettingsDto,
  RsvpSummaryDto,
  SaveRsvpSettingsDto,
} from './dto/rsvp.dto';
import { EXPORT_CONTENT_TYPES } from './export-file';
import { OpenRsvpService } from './open-rsvp.service';
import { RsvpReportService } from './rsvp-report.service';
import { RsvpService } from './rsvp.service';

const iso = (date: Date | null) => date?.toISOString() ?? null;

// RSVP no painel, área Convidados (spec 010): owner e editor (PRD RF38).
@ApiTags('rsvp')
@ApiWeddingParam()
@Roles('owner', 'editor')
@Controller('weddings/:weddingId/rsvp')
export class RsvpController {
  constructor(
    private readonly rsvp: RsvpService,
    private readonly open: OpenRsvpService,
    private readonly reports: RsvpReportService,
  ) {}

  @Get('settings')
  @ZodResponse({ status: 200, type: RsvpSettingsDto })
  async getSettings(@Tenant() tenant: TenantContext) {
    const settings = await this.rsvp.getSettings(tenant.weddingId);
    return { ...settings, deadline: iso(settings.deadline) };
  }

  @Put('settings')
  @ZodResponse({ status: 200, type: RsvpSettingsDto })
  async saveSettings(@Tenant() tenant: TenantContext, @Body() body: SaveRsvpSettingsDto) {
    const settings = await this.rsvp.saveSettings(tenant.weddingId, {
      openModeEnabled: body.openModeEnabled,
      deadline: body.deadline ? new Date(body.deadline) : null,
    });
    return { ...settings, deadline: iso(settings.deadline) };
  }

  @Get('summary')
  @ZodResponse({ status: 200, type: RsvpSummaryDto })
  summary(@Tenant() tenant: TenantContext) {
    return this.reports.summary(tenant.weddingId);
  }

  @Get('people')
  @ZodResponse({ status: 200, type: RsvpPeoplePageDto })
  async people(@Tenant() tenant: TenantContext, @Query() query: ListPeopleQueryDto) {
    const page = await this.reports.people(tenant.weddingId, query.status, query.page);
    return {
      ...page,
      items: page.items.map((person) => ({ ...person, respondedAt: iso(person.respondedAt) })),
    };
  }

  @Get('open-responses')
  @ZodResponse({ status: 200, type: OpenResponsesPageDto })
  async openResponses(@Tenant() tenant: TenantContext, @Query() query: PageQueryDto) {
    const page = await this.open.list(tenant.weddingId, query.page);
    return {
      ...page,
      items: page.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    };
  }

  @Delete('open-responses/:responseId')
  @HttpCode(204)
  async deleteOpenResponse(
    @Tenant() tenant: TenantContext,
    @Param('responseId') responseId: string,
  ): Promise<void> {
    await this.open.delete(tenant.weddingId, responseId);
  }

  @Get('export')
  @ApiProduces(EXPORT_CONTENT_TYPES.xlsx, EXPORT_CONTENT_TYPES.csv)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async export(
    @Tenant() tenant: TenantContext,
    @Query() query: ExportQueryDto,
  ): Promise<StreamableFile> {
    const file = await this.reports.export(tenant.weddingId, query.format);
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
