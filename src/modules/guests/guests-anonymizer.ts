import { Injectable, OnModuleInit } from '@nestjs/common';
import { PersonalDataAnonymizers } from '../weddings/personal-data-anonymizers';
import { InvitationsRepository } from './invitations.repository';

/** Registra a anonimização das pessoas dos convites na rotina do weddings (spec 015). */
@Injectable()
export class GuestsAnonymizer implements OnModuleInit {
  constructor(
    private readonly anonymizers: PersonalDataAnonymizers,
    private readonly invitations: InvitationsRepository,
  ) {}

  onModuleInit(): void {
    this.anonymizers.register({
      name: 'guests',
      anonymize: (weddingId) => this.invitations.anonymizeGuests(weddingId),
    });
  }
}
