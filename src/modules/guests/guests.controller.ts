import { Body, Controller, Delete, HttpCode, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../common/auth/access.decorators';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { GuestDto, UpdateGuestDto } from './dto/guests.dto';
import { GuestsService } from './guests.service';

// Pessoas de um convite (spec 009 RF02, RF04): owner e editor.
@ApiTags('guests')
@ApiWeddingParam()
@Roles('owner', 'editor')
@Controller('weddings/:weddingId/guests')
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Patch(':guestId')
  @ZodResponse({ status: 200, type: GuestDto })
  update(
    @Tenant() tenant: TenantContext,
    @Param('guestId') guestId: string,
    @Body() body: UpdateGuestDto,
  ) {
    return this.guests.updateGuest(tenant.weddingId, guestId, body);
  }

  @Delete(':guestId')
  @HttpCode(204)
  async delete(@Tenant() tenant: TenantContext, @Param('guestId') guestId: string) {
    await this.guests.deleteGuest(tenant.weddingId, guestId);
  }
}
