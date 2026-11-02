import { Injectable, OnModuleInit } from '@nestjs/common';
import { PersonalDataAnonymizers } from '../weddings/personal-data-anonymizers';
import { OpenRsvpRepository } from './open-rsvp.repository';
import { RsvpRepository } from './rsvp.repository';

/** Registra a anonimização das respostas, inclusive as abertas, na rotina do weddings (spec 015). */
@Injectable()
export class RsvpAnonymizer implements OnModuleInit {
  constructor(
    private readonly anonymizers: PersonalDataAnonymizers,
    private readonly responses: RsvpRepository,
    private readonly openResponses: OpenRsvpRepository,
  ) {}

  onModuleInit(): void {
    this.anonymizers.register({
      name: 'rsvp_responses, open_rsvp_responses',
      anonymize: async (weddingId) => {
        await this.responses.anonymizeDietaryNotes(weddingId);
        await this.openResponses.anonymize(weddingId);
      },
    });
  }
}
