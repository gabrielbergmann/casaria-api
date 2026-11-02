import { Module } from '@nestjs/common';
import { WeddingsModule } from '../weddings/weddings.module';
import { GuestImportService } from './guest-import.service';
import { GuestsAnonymizer } from './guests-anonymizer';
import { GuestImportsController } from './guest-imports.controller';
import { GuestSettingsController } from './guest-settings.controller';
import { GuestSettingsRepository } from './guest-settings.repository';
import { GuestsController } from './guests.controller';
import { GuestsService } from './guests.service';
import { InvitationsController } from './invitations.controller';
import { InvitationsRepository } from './invitations.repository';

// Convidados (spec 009). Exporta o GuestsService para o rsvp (010); nunca o contrário. Registra a
// anonimização no weddings (spec 015).
@Module({
  imports: [WeddingsModule],
  controllers: [
    InvitationsController,
    GuestsController,
    GuestImportsController,
    GuestSettingsController,
  ],
  providers: [
    GuestsService,
    GuestImportService,
    InvitationsRepository,
    GuestSettingsRepository,
    GuestsAnonymizer,
  ],
  exports: [GuestsService],
})
export class GuestsModule {}
