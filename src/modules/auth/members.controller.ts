import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import {
  CreatedMemberInvitationDto,
  CreateMemberInvitationDto,
  MemberAccessDto,
} from './dto/member-access.dto';
import { MemberInvitationsService } from './member-invitations.service';
import { MembersService } from './members.service';

const toInvitationDto = <T extends { expiresAt: Date }>(invitation: T) => ({
  ...invitation,
  expiresAt: invitation.expiresAt.toISOString(),
});

// Acesso ao painel (Configurações): sem @Roles, só o owner (PRD RF38, RF39).
@ApiTags('members')
@ApiWeddingParam()
@Controller('weddings/:weddingId')
export class MembersController {
  constructor(
    private readonly members: MembersService,
    private readonly invitations: MemberInvitationsService,
  ) {}

  @Get('members')
  @ZodResponse({ status: 200, type: MemberAccessDto })
  async list(@Tenant() tenant: TenantContext) {
    const access = await this.members.listAccess(tenant.weddingId);
    return { members: access.members, invitations: access.invitations.map(toInvitationDto) };
  }

  @Post('invitations')
  @ZodResponse({ status: 201, type: CreatedMemberInvitationDto })
  async invite(@Tenant() tenant: TenantContext, @Body() body: CreateMemberInvitationDto) {
    return toInvitationDto(await this.invitations.invite(tenant.weddingId, body.email, body.role));
  }

  @Delete('invitations/:invitationId')
  @HttpCode(204)
  async cancel(@Tenant() tenant: TenantContext, @Param('invitationId') invitationId: string) {
    await this.invitations.cancel(tenant.weddingId, invitationId);
  }

  @Delete('members/:memberId')
  @HttpCode(204)
  async remove(@Tenant() tenant: TenantContext, @Param('memberId') memberId: string) {
    await this.members.remove(tenant.weddingId, memberId);
  }
}
