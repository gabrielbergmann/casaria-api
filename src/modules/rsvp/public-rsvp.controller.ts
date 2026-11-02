import { Body, Controller, Get, HttpCode, Ip, Post, Put, UseGuards } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../../common/auth/access.decorators';
import { PublicTenantGuard } from '../../common/tenant/public-tenant.guard';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import {
  AnswerInvitationDto,
  IdentifyInvitationDto,
  InvitationRsvpDto,
  OpenAnswerDto,
  PublicRsvpStatusDto,
} from './dto/rsvp.dto';
import { OpenRsvpService } from './open-rsvp.service';
import { type InvitationRsvpView, RsvpService } from './rsvp.service';

const toDto = (view: InvitationRsvpView) => ({
  ...view,
  deadline: view.deadline?.toISOString() ?? null,
});

// RSVP pelo site (spec 010): casamento pelo slug com site publicado; o token vai só no corpo,
// nunca no caminho ou na query (RNF02).
@ApiTags('public-rsvp')
@Public()
@UseGuards(PublicTenantGuard)
@ApiParam({ name: 'slug', type: String, required: true })
@Controller('public/sites/:slug')
export class PublicRsvpController {
  constructor(
    private readonly rsvp: RsvpService,
    private readonly open: OpenRsvpService,
  ) {}

  @Get('rsvp')
  @ZodResponse({ status: 200, type: PublicRsvpStatusDto })
  async status(@Tenant() tenant: TenantContext) {
    const status = await this.rsvp.getPublicStatus(tenant.weddingId);
    return { ...status, deadline: status.deadline?.toISOString() ?? null };
  }

  @Post('invitations/identify')
  @Throttle({ default: { limit: 20, ttl: minutes(1) } })
  @ZodResponse({ status: 200, type: InvitationRsvpDto })
  async identify(
    @Tenant() tenant: TenantContext,
    @Body() body: IdentifyInvitationDto,
    @Ip() ip: string,
  ) {
    const input = body.token !== undefined ? { token: body.token } : { code: body.code };
    return toDto(await this.rsvp.identify(tenant.weddingId, input, ip));
  }

  @Put('rsvp/invitation')
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @ZodResponse({ status: 200, type: InvitationRsvpDto })
  async answerInvitation(@Tenant() tenant: TenantContext, @Body() body: AnswerInvitationDto) {
    const view = await this.rsvp.answerInvitation(tenant.weddingId, {
      token: body.token,
      answers: body.answers.map((answer) => ({ ...answer, message: answer.message ?? null })),
      companions: body.companions.map((companion) => ({
        ...companion,
        id: companion.id ?? null,
        message: companion.message ?? null,
      })),
    });
    return toDto(view);
  }

  @Post('rsvp/open')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  async answerOpen(@Tenant() tenant: TenantContext, @Body() body: OpenAnswerDto): Promise<void> {
    await this.open.answer(tenant.weddingId, {
      name: body.name,
      status: body.status,
      phone: body.phone ?? null,
      email: body.email ?? null,
      message: body.message ?? null,
    });
  }
}
