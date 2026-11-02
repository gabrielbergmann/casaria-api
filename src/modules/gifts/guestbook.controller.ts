import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../common/auth/access.decorators';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import {
  GuestbookMessageDto,
  GuestbookPageDto,
  GuestbookQueryDto,
  ModerateGuestbookMessageDto,
} from './dto/guestbook.dto';
import type { GuestbookMessageRecord } from './guestbook.repository';
import { GuestbookService } from './guestbook.service';

const toDto = (message: GuestbookMessageRecord) => ({
  ...message,
  createdAt: message.createdAt.toISOString(),
  updatedAt: message.updatedAt.toISOString(),
});

// Moderação do mural na área Site (spec 013 RF07 a RF09): owner e editor; o PATCH exige o Origin
// do painel pelo OriginGuard global.
@ApiTags('guestbook')
@ApiWeddingParam()
@Roles('owner', 'editor')
@Controller('weddings/:weddingId/guestbook/messages')
export class GuestbookController {
  constructor(private readonly guestbook: GuestbookService) {}

  @Get()
  @ZodResponse({ status: 200, type: GuestbookPageDto })
  async list(@Tenant() tenant: TenantContext, @Query() query: GuestbookQueryDto) {
    const page = await this.guestbook.listForPanel(tenant.weddingId, query.status, query.cursor);
    return { ...page, items: page.items.map(toDto) };
  }

  @Patch(':messageId')
  @ZodResponse({ status: 200, type: GuestbookMessageDto })
  async moderate(
    @Tenant() tenant: TenantContext,
    @Param('messageId') messageId: string,
    @Body() body: ModerateGuestbookMessageDto,
  ) {
    return toDto(await this.guestbook.moderate(tenant.weddingId, messageId, body.status));
  }
}
