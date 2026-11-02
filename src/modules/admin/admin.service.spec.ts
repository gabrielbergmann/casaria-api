import type { TransactionRunner } from '../../infra/prisma/transaction-runner';
import type { MemberInvitationsService } from '../auth/member-invitations.service';
import { WeddingSlugUnavailable } from '../weddings/errors/wedding-slug-unavailable';
import type { WeddingsService } from '../weddings/weddings.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  const weddings = { create: jest.fn(), listAll: jest.fn() };
  const invitations = { invite: jest.fn() };
  const tx = { tx: true };
  const transactions = { run: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) };
  const service = new AdminService(
    weddings as unknown as WeddingsService,
    invitations as unknown as MemberInvitationsService,
    transactions as unknown as TransactionRunner,
  );
  const input = {
    coupleName: 'Ana & Bia',
    weddingDate: new Date('2027-11-20T19:00:00Z'),
    slug: 'ana-e-bia',
    ownerEmail: 'ana@example.com',
  };

  beforeEach(() => jest.clearAllMocks());

  it('creates the wedding and the owner invitation in the same transaction', async () => {
    weddings.create.mockResolvedValue('wedding-new');
    invitations.invite.mockResolvedValue({
      email: 'ana@example.com',
      role: 'owner',
      link: 'https://app/invite#token=x',
    });

    const created = await service.createWedding(input);

    expect(weddings.create).toHaveBeenCalledWith(
      { coupleName: 'Ana & Bia', weddingDate: input.weddingDate, slug: 'ana-e-bia' },
      tx,
    );
    expect(invitations.invite).toHaveBeenCalledWith('wedding-new', 'ana@example.com', 'owner', tx);
    expect(created.weddingId).toBe('wedding-new');
  });

  it('creates nothing when the slug is in use', async () => {
    weddings.create.mockRejectedValue(new WeddingSlugUnavailable());

    await expect(service.createWedding(input)).rejects.toBeInstanceOf(WeddingSlugUnavailable);
    expect(invitations.invite).not.toHaveBeenCalled();
  });
});
