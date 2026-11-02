import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../common/auth/access.decorators';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import {
  CreateGuestDto,
  CreateInvitationDto,
  GuestDto,
  InvitationCredentialsDto,
  InvitationDto,
  InvitationPageDto,
  ListInvitationsQueryDto,
  UpdateInvitationDto,
} from './dto/guests.dto';
import { toGuestData } from './guest-data';
import { GuestsService } from './guests.service';

// Convites da lista de convidados (spec 009). O caminho é guest-invitations porque
// /weddings/:weddingId/invitations já é dos convites de acesso ao painel (spec 005).
// Convidados são conteúdo: owner e editor (PRD RF38); escritas exigem o Origin do painel.
@ApiTags('guests')
@ApiWeddingParam()
@Roles('owner', 'editor')
@Controller('weddings/:weddingId/guest-invitations')
export class InvitationsController {
  constructor(private readonly guests: GuestsService) {}

  @Get()
  @ZodResponse({ status: 200, type: InvitationPageDto })
  list(@Tenant() tenant: TenantContext, @Query() query: ListInvitationsQueryDto) {
    return this.guests.list(tenant.weddingId, query.search, query.page);
  }

  @Post()
  @ZodResponse({ status: 201, type: InvitationDto })
  create(@Tenant() tenant: TenantContext, @Body() body: CreateInvitationDto) {
    return this.guests.create(tenant.weddingId, {
      label: body.label,
      maxCompanions: body.maxCompanions,
      guests: body.guests.map(toGuestData),
    });
  }

  @Get(':invitationId')
  @ZodResponse({ status: 200, type: InvitationDto })
  get(@Tenant() tenant: TenantContext, @Param('invitationId') invitationId: string) {
    return this.guests.get(tenant.weddingId, invitationId);
  }

  @Patch(':invitationId')
  @ZodResponse({ status: 200, type: InvitationDto })
  update(
    @Tenant() tenant: TenantContext,
    @Param('invitationId') invitationId: string,
    @Body() body: UpdateInvitationDto,
  ) {
    return this.guests.update(tenant.weddingId, invitationId, body);
  }

  @Delete(':invitationId')
  @HttpCode(204)
  async delete(@Tenant() tenant: TenantContext, @Param('invitationId') invitationId: string) {
    await this.guests.delete(tenant.weddingId, invitationId);
  }

  @Post(':invitationId/guests')
  @ZodResponse({ status: 201, type: GuestDto })
  addGuest(
    @Tenant() tenant: TenantContext,
    @Param('invitationId') invitationId: string,
    @Body() body: CreateGuestDto,
  ) {
    return this.guests.addGuest(tenant.weddingId, invitationId, toGuestData(body));
  }

  @Post(':invitationId/regenerate-credentials')
  @ZodResponse({ status: 200, type: InvitationCredentialsDto })
  regenerateCredentials(
    @Tenant() tenant: TenantContext,
    @Param('invitationId') invitationId: string,
  ) {
    return this.guests.regenerateCredentials(tenant.weddingId, invitationId);
  }
}
