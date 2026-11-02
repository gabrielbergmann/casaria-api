import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { hours, Throttle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../../common/auth/access.decorators';
import { PublicTenantGuard } from '../../common/tenant/public-tenant.guard';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import {
  GuestbookCreatedDto,
  GuestbookInputDto,
  PublicGuestbookPageDto,
  PublicGuestbookQueryDto,
} from './dto/guestbook.dto';
import { GuestbookService } from './guestbook.service';

/** Limite do envio por IP no Redis (spec 013 RF04), mais restrito que o global. */
export const GUESTBOOK_POST_LIMIT = { default: { limit: 100, ttl: hours(1) } };

// Mural no site (spec 013): casamento pelo slug com site publicado, sem login nem convite.
@ApiTags('public-guestbook')
@Public()
@UseGuards(PublicTenantGuard)
@ApiParam({ name: 'slug', type: String, required: true })
@Controller('public/sites/:slug/guestbook/messages')
export class PublicGuestbookController {
  constructor(private readonly guestbook: GuestbookService) {}

  @Post()
  @Throttle(GUESTBOOK_POST_LIMIT)
  @ZodResponse({ status: 201, type: GuestbookCreatedDto })
  async post(@Tenant() tenant: TenantContext, @Body() body: GuestbookInputDto) {
    const message = await this.guestbook.post(tenant.weddingId, {
      authorName: body.authorName,
      body: body.body,
    });
    return { id: message.id, status: 'PENDING' as const };
  }

  @Get()
  @ZodResponse({ status: 200, type: PublicGuestbookPageDto })
  async list(@Tenant() tenant: TenantContext, @Query() query: PublicGuestbookQueryDto) {
    const page = await this.guestbook.listApproved(tenant.weddingId, query.cursor);
    return {
      items: page.items.map(({ id, authorName, body, createdAt }) => ({
        id,
        authorName,
        body,
        createdAt: createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
