import { Module } from '@nestjs/common';
import { Clock } from '../../common/time/clock';
import { MediaModule } from '../media/media.module';
import { MediaService } from '../media/media.service';
import { AnonymizationCron } from './anonymization.cron';
import { PersonalDataAnonymizers } from './personal-data-anonymizers';
import { WEDDING_FILES } from './wedding-files';
import { WeddingsController } from './weddings.controller';
import { WeddingsRepository } from './weddings.repository';
import { WeddingsService } from './weddings.service';

// A entrada do HTML por host (resolveHost) é usada pelo SiteHtmlMiddleware do módulo site. O
// registro de anonimizadores é preenchido por guests, rsvp e payments (spec 015).
@Module({
  imports: [MediaModule],
  controllers: [WeddingsController],
  providers: [
    WeddingsService,
    WeddingsRepository,
    // Exclusão do casamento apaga os arquivos do storage (spec 006 RF12).
    { provide: WEDDING_FILES, useExisting: MediaService },
    PersonalDataAnonymizers,
    AnonymizationCron,
    Clock,
  ],
  exports: [WeddingsService, PersonalDataAnonymizers],
})
export class WeddingsModule {}
