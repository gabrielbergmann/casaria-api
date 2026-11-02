import { Module } from '@nestjs/common';
import { Clock } from '../../common/time/clock';
import { GuestsModule } from '../guests/guests.module';
import { SiteModule } from '../site/site.module';
import { WeddingsModule } from '../weddings/weddings.module';
import { CodeAttempts } from './code-attempts';
import { OpenRsvpRepository } from './open-rsvp.repository';
import { OpenRsvpService } from './open-rsvp.service';
import { PublicRsvpController } from './public-rsvp.controller';
import { RsvpAnonymizer } from './rsvp-anonymizer';
import { RsvpReportService } from './rsvp-report.service';
import { RsvpController } from './rsvp.controller';
import { RsvpRepository } from './rsvp.repository';
import { RsvpService } from './rsvp.service';

// RSVP (spec 010): depende de guests (convites e acompanhantes), nunca o contrário. O SiteModule
// entra pelo PublicTenantGuard das rotas públicas; o WeddingsModule, pela anonimização (015).
@Module({
  imports: [GuestsModule, SiteModule, WeddingsModule],
  controllers: [PublicRsvpController, RsvpController],
  providers: [
    RsvpService,
    OpenRsvpService,
    RsvpReportService,
    RsvpRepository,
    OpenRsvpRepository,
    CodeAttempts,
    RsvpAnonymizer,
    Clock,
  ],
})
export class RsvpModule {}
