import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { forEachWedding } from '../../common/tenant/for-each-wedding';
import { Clock } from '../../common/time/clock';
import { PersonalDataAnonymizers } from './personal-data-anonymizers';
import { WeddingsService } from './weddings.service';

/**
 * Anonimização diária às 02:00 de Brasília (spec 015 RF01 a RF04, ADR-001): cada módulo
 * anonimiza as suas tabelas e só então o casamento é marcado. Sem transação entre módulos: os
 * updates são idempotentes, e um casamento que falhou fica sem marca e é refeito no dia seguinte.
 */
@Injectable()
export class AnonymizationCron {
  constructor(
    private readonly weddings: WeddingsService,
    private readonly anonymizers: PersonalDataAnonymizers,
    private readonly clock: Clock,
    @InjectPinoLogger(AnonymizationCron.name) private readonly logger: PinoLogger,
  ) {}

  @Cron('0 2 * * *', { name: 'weddings-anonymize-personal-data', timeZone: 'America/Sao_Paulo' })
  async run(): Promise<void> {
    const now = this.clock.now();
    const weddingIds = await this.weddings.listIdsDueForAnonymization(now);
    await forEachWedding(
      weddingIds,
      async (weddingId) => {
        for (const anonymizer of this.anonymizers.all()) await anonymizer.anonymize(weddingId);
        await this.weddings.markAnonymized(weddingId, now);
        this.logger.info('personal_data_anonymized');
      },
      this.logger,
    );
  }
}
