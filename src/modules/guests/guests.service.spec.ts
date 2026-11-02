import type { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import type { Env } from '../../infra/config/env.schema';
import type { WeddingsService } from '../weddings/weddings.service';
import { CODE_ALPHABET } from './credentials';
import { GuestNotFound } from './errors/guest-not-found';
import { InvitationNotFound } from './errors/invitation-not-found';
import { InvitationRequiresGuest } from './errors/invitation-requires-guest';
import type { GuestSettingsRepository } from './guest-settings.repository';
import { DEFAULT_INVITE_MESSAGE, GuestsService } from './guests.service';
import type { InvitationRecord, InvitationsRepository } from './invitations.repository';

const WEDDING_A = '01890000-0000-7000-8000-00000000000a';
const WEDDING_B = '01890000-0000-7000-8000-00000000000b';
const INV_A = '01890000-0000-7000-8000-0000000000a1';
const INV_B = '01890000-0000-7000-8000-0000000000b1';
const GUEST_A = '01890000-0000-7000-8000-0000000000a2';

type StoredInvitation = InvitationRecord & { weddingId: string };

const invitation = (weddingId: string, id: string, token: string, code: string) => ({
  weddingId,
  id,
  label: 'Família Souza',
  maxCompanions: 1,
  token,
  code,
  guests: [
    {
      id: GUEST_A,
      invitationId: id,
      name: 'Ana Souza',
      isChild: false,
      phone: '+5511999990000',
      email: null,
      origin: 'LIST' as const,
    },
  ],
});

/** Banco falso em memória com o mesmo filtro por casamento do repository real. */
function fakeRepository(rows: StoredInvitation[]) {
  const strip = ({ weddingId: _w, ...record }: StoredInvitation): InvitationRecord => record;
  const where = (weddingId: string, match: (row: StoredInvitation) => boolean) =>
    rows.find((row) => row.weddingId === weddingId && match(row));
  return {
    listPage: jest.fn(async (weddingId: string) => {
      const items = rows.filter((row) => row.weddingId === weddingId).map(strip);
      return { items, total: items.length };
    }),
    find: jest.fn(async (weddingId: string, id: string) => {
      const row = where(weddingId, (r) => r.id === id);
      return row ? strip(row) : null;
    }),
    findByToken: jest.fn(async (weddingId: string, token: string) => {
      const row = where(weddingId, (r) => r.token === token);
      return row ? strip(row) : null;
    }),
    findByCode: jest.fn(async (weddingId: string, code: string) => {
      const row = where(weddingId, (r) => r.code === code);
      return row ? strip(row) : null;
    }),
    listCodes: jest.fn(
      async (weddingId: string) =>
        new Set(rows.filter((row) => row.weddingId === weddingId).map((row) => row.code)),
    ),
    create: jest.fn(async (weddingId: string, data: Omit<InvitationRecord, 'id' | 'guests'>) => ({
      ...data,
      id: INV_A,
      guests: [],
    })),
    update: jest.fn(async () => false),
    replaceCredentials: jest.fn(
      async (weddingId: string, id: string, token: string, code: string) => {
        const row = where(weddingId, (r) => r.id === id);
        if (!row) return false;
        Object.assign(row, { token, code });
        return true;
      },
    ),
    delete: jest.fn(async () => false),
    createGuest: jest.fn(),
    findGuest: jest.fn(async (weddingId: string, guestId: string) => {
      const row = rows.find((r) => r.weddingId === weddingId && r.guests[0]?.id === guestId);
      return row?.guests[0] ?? null;
    }),
    updateGuest: jest.fn(async () => false),
    countGuests: jest.fn(async () => 1),
    deleteGuest: jest.fn(),
    deleteCompanionsExcept: jest.fn(),
  };
}

describe('GuestsService', () => {
  let rows: StoredInvitation[];
  let repository: ReturnType<typeof fakeRepository>;
  const settings = { findInviteMessage: jest.fn(), saveInviteMessage: jest.fn() };
  const weddings = { getDetails: jest.fn() };
  const config = {
    get: (key: string) => ({ NODE_ENV: 'production', APP_DOMAIN: 'casaria.test' })[key],
  } as unknown as ConfigService<Env, true>;
  let service: GuestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    rows = [
      invitation(WEDDING_A, INV_A, 'token-of-a-0000000000', 'K7MQ2X'),
      invitation(WEDDING_B, INV_B, 'token-of-b-0000000000', 'BBBBBB'),
    ];
    repository = fakeRepository(rows);
    weddings.getDetails.mockResolvedValue({ slug: 'ana-e-bia' });
    service = new GuestsService(
      repository as unknown as InvitationsRepository,
      settings as unknown as GuestSettingsRepository,
      weddings as unknown as WeddingsService,
      config,
    );
  });

  it('shows the code and the link with the token only in the fragment, never the token alone', async () => {
    const view = await service.get(WEDDING_A, INV_A);

    expect(view.code).toBe('K7MQ2X');
    expect(view.inviteUrl).toBe('https://ana-e-bia.casaria.test/#convite=token-of-a-0000000000');
    expect(view).not.toHaveProperty('token');
  });

  it('pages 50 invitations at a time with the trimmed search', async () => {
    const page = await service.list(WEDDING_A, '  souza ', 3);

    expect(repository.listPage).toHaveBeenCalledWith(WEDDING_A, 'souza', 100, 50);
    expect(page).toMatchObject({ page: 3, pageSize: 50, total: 1 });
  });

  it('creates the invitation with a fresh token and a code free in the wedding', async () => {
    await service.create(WEDDING_A, { label: 'Família Lima', maxCompanions: 0, guests: [] });

    const [weddingId, data] = repository.create.mock.calls[0];
    expect(weddingId).toBe(WEDDING_A);
    expect(data.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(data.code).toHaveLength(6);
    expect([...data.code].every((char: string) => CODE_ALPHABET.includes(char))).toBe(true);
    expect(data.code).not.toBe('K7MQ2X');
  });

  it('draws the code again when another write took it at the same time', async () => {
    const taken = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    repository.create.mockRejectedValueOnce(taken);

    await service.create(WEDDING_A, { label: 'Família Lima', maxCompanions: 0, guests: [] });

    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  describe('identification exported to the rsvp', () => {
    it('finds the invitation by the typed code " k7m q2x " in its own wedding', async () => {
      await expect(service.identifyByCode(WEDDING_A, ' k7m q2x ')).resolves.toMatchObject({
        id: INV_A,
      });
      expect(repository.findByCode).toHaveBeenCalledWith(WEDDING_A, 'K7MQ2X');
    });

    it('does not identify the code or the token of another wedding', async () => {
      await expect(service.identifyByCode(WEDDING_A, 'BBBBBB')).resolves.toBeNull();
      await expect(service.identifyByToken(WEDDING_A, 'token-of-b-0000000000')).resolves.toBeNull();
    });

    it('stops finding the old token and code and finds the new ones after regenerating', async () => {
      const fresh = await service.regenerateCredentials(WEDDING_A, INV_A);
      const newToken = fresh.inviteUrl.split('#convite=')[1];

      await expect(service.identifyByToken(WEDDING_A, 'token-of-a-0000000000')).resolves.toBeNull();
      await expect(service.identifyByCode(WEDDING_A, 'K7MQ2X')).resolves.toBeNull();
      await expect(service.identifyByToken(WEDDING_A, newToken)).resolves.toMatchObject({
        id: INV_A,
      });
      await expect(service.identifyByCode(WEDDING_A, fresh.code)).resolves.toMatchObject({
        id: INV_A,
      });
      expect(fresh.inviteUrl).toMatch(/^https:\/\/ana-e-bia\.casaria\.test\/#convite=.{22}$/);
    });

    it('does not regenerate an invitation of another wedding', async () => {
      await expect(service.regenerateCredentials(WEDDING_A, INV_B)).rejects.toBeInstanceOf(
        InvitationNotFound,
      );
      expect(repository.replaceCredentials).not.toHaveBeenCalled();
      expect(rows[1]).toMatchObject({ token: 'token-of-b-0000000000', code: 'BBBBBB' });
    });

    it('identifies nothing with an empty token or code', async () => {
      await expect(service.identifyByToken(WEDDING_A, '')).resolves.toBeNull();
      await expect(service.identifyByCode(WEDDING_A, ' - ')).resolves.toBeNull();
      expect(repository.findByCode).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['get', () => service.get(WEDDING_A, INV_B)],
    ['update', () => service.update(WEDDING_A, INV_B, { label: 'x' })],
    ['delete', () => service.delete(WEDDING_A, INV_B)],
    ['add a person to', () => service.addGuest(WEDDING_A, INV_B, {} as never)],
    ['get with an id that is not a UUID', () => service.get(WEDDING_A, 'nao-e-uuid')],
  ])('answers invitation.not_found to %s an invitation of another wedding', async (_case, act) => {
    await expect(act()).rejects.toBeInstanceOf(InvitationNotFound);
    expect(repository.createGuest).not.toHaveBeenCalled();
  });

  it('answers guest.not_found to a person of another wedding', async () => {
    await expect(service.updateGuest(WEDDING_A, GUEST_A, { name: 'x' })).rejects.toBeInstanceOf(
      GuestNotFound,
    );
    await expect(service.deleteGuest(WEDDING_B, 'nao-e-uuid')).rejects.toBeInstanceOf(
      GuestNotFound,
    );
  });

  it('refuses to delete the only person of an invitation and keeps it', async () => {
    const error = await service.deleteGuest(WEDDING_A, GUEST_A).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvitationRequiresGuest);
    expect(error).toMatchObject({ status: 409, code: 'invitation.requires_guest' });
    expect(repository.countGuests).toHaveBeenCalledWith(WEDDING_A, INV_A);
    expect(repository.deleteGuest).not.toHaveBeenCalled();
  });

  it('deletes a person when the invitation keeps someone', async () => {
    repository.countGuests.mockResolvedValue(2);

    await service.deleteGuest(WEDDING_A, GUEST_A);

    expect(repository.deleteGuest).toHaveBeenCalledWith(WEDDING_A, GUEST_A);
  });

  it('keeps only the companions sent, inside the transaction received', async () => {
    const tx = { tag: 'tx' } as never;
    repository.updateGuest.mockResolvedValue(true);
    repository.createGuest.mockResolvedValue({ id: 'new-companion' });

    const ids = await service.syncCompanions(
      WEDDING_A,
      INV_A,
      [
        { id: 'companion-1', name: 'Caio', isChild: false },
        { id: null, name: 'Duda', isChild: true },
      ],
      tx,
    );

    expect(ids).toEqual(['companion-1', 'new-companion']);
    expect(repository.deleteCompanionsExcept).toHaveBeenCalledWith(
      WEDDING_A,
      INV_A,
      ['companion-1'],
      tx,
    );
    expect(repository.updateGuest).toHaveBeenCalledWith(
      WEDDING_A,
      'companion-1',
      { name: 'Caio', isChild: false },
      tx,
    );
    expect(repository.createGuest).toHaveBeenCalledWith(
      WEDDING_A,
      INV_A,
      { name: 'Duda', isChild: true, phone: null, email: null, origin: 'COMPANION' },
      tx,
    );
  });

  it('uses the default invite message while the couple has not written one', async () => {
    settings.findInviteMessage.mockResolvedValue(null);

    await expect(service.getInviteMessage(WEDDING_A)).resolves.toBe(DEFAULT_INVITE_MESSAGE);
    expect(DEFAULT_INVITE_MESSAGE).toContain('{convite}');
    expect(DEFAULT_INVITE_MESSAGE).toContain('{link}');
    expect(DEFAULT_INVITE_MESSAGE).toContain('{codigo}');
  });
});
