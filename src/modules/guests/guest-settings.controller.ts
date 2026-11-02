import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../common/auth/access.decorators';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { GuestSettingsDto } from './dto/guests.dto';
import { GuestsService } from './guests.service';

// Texto do convite (spec 009 RF13): owner e editor.
@ApiTags('guests')
@ApiWeddingParam()
@Roles('owner', 'editor')
@Controller('weddings/:weddingId/guest-settings')
export class GuestSettingsController {
  constructor(private readonly guests: GuestsService) {}

  @Get()
  @ZodResponse({ status: 200, type: GuestSettingsDto })
  async get(@Tenant() tenant: TenantContext) {
    return { inviteMessage: await this.guests.getInviteMessage(tenant.weddingId) };
  }

  @Put()
  @ZodResponse({ status: 200, type: GuestSettingsDto })
  async save(@Tenant() tenant: TenantContext, @Body() body: GuestSettingsDto) {
    return {
      inviteMessage: await this.guests.saveInviteMessage(tenant.weddingId, body.inviteMessage),
    };
  }
}
