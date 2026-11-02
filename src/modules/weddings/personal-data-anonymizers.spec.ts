import { expectWeddingScoped } from '../../common/testing/wedding-scope';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { GuestsAnonymizer } from '../guests/guests-anonymizer';
import { InvitationsRepository } from '../guests/invitations.repository';
import { OrdersAnonymizer } from '../payments/orders/orders-anonymizer';
import { OrdersRepository } from '../payments/orders/orders.repository';
import { OpenRsvpRepository } from '../rsvp/open-rsvp.repository';
import { RsvpAnonymizer } from '../rsvp/rsvp-anonymizer';
import { RsvpRepository } from '../rsvp/rsvp.repository';
import { PersonalDataAnonymizers } from './personal-data-anonymizers';

// Tabela de anonimização da spec 015 (RF02, RF03): cada módulo dono se registra e troca só os
// campos da tabela, em um updateMany por tabela e casamento, sem apagar linhas.
describe('Personal data anonymizers (spec 015)', () => {
  const model = () => ({
    updateMany: jest.fn().mockResolvedValue({ count: 3 }),
    deleteMany: jest.fn(),
  });
  const prisma = {
    guest: model(),
    rsvpResponse: model(),
    openRsvpResponse: model(),
    order: model(),
  };
  const db = prisma as unknown as PrismaService;
  const registry = new PersonalDataAnonymizers();
  new GuestsAnonymizer(registry, new InvitationsRepository(db)).onModuleInit();
  new RsvpAnonymizer(registry, new RsvpRepository(db), new OpenRsvpRepository(db)).onModuleInit();
  new OrdersAnonymizer(registry, new OrdersRepository(db)).onModuleInit();

  beforeAll(async () => {
    for (const anonymizer of registry.all()) await anonymizer.anonymize('wedding-a');
  });

  it('registers guests, rsvp and orders in the weddings routine', () => {
    expect(registry.all().map((anonymizer) => anonymizer.name)).toEqual([
      'guests',
      'rsvp_responses, open_rsvp_responses',
      'orders',
    ]);
  });

  it.each([
    ['guests', prisma.guest, { name: 'Convidado anonimizado', phone: null, email: null }],
    ['rsvp_responses', prisma.rsvpResponse, { dietaryNotes: null }],
    [
      'open_rsvp_responses',
      prisma.openRsvpResponse,
      { name: 'Visitante anonimizado', phone: null, email: null },
    ],
    [
      'orders',
      prisma.order,
      { payerName: 'Pagador anonimizado', payerEmail: null, payerCpfEnc: null },
    ],
  ])('replaces only the personal fields of %s, once, for the wedding', (_table, table, data) => {
    expect(table.updateMany).toHaveBeenCalledTimes(1);
    // Só esses campos: mensagens, rótulos, recados, valores, status e agradecido ficam.
    expect(table.updateMany).toHaveBeenCalledWith({ where: { weddingId: 'wedding-a' }, data });
    expectWeddingScoped(table.updateMany, 'wedding-a');
    expect(table.deleteMany).not.toHaveBeenCalled();
  });
});
