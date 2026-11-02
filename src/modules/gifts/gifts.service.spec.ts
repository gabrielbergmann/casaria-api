import type { Clock } from '../../common/time/clock';
import type { MediaUsageChecker } from '../media/media-usage';
import type { MediaService } from '../media/media.service';
import {
  GiftInvalidAmount,
  GiftInvalidCategory,
  GiftInvalidMedia,
  GiftInvalidOrder,
  GiftLocked,
  GiftNotFound,
  GiftQuotaTotalTooLow,
  GiftSoldOut,
} from './errors/gift-errors';
import type { GiftCategoriesRepository } from './gift-categories.repository';
import type { GiftData, GiftRecord, GiftsRepository } from './gifts.repository';
import { GiftsService } from './gifts.service';

const WEDDING_A = '01890000-0000-7000-8000-00000000000a';
const WEDDING_B = '01890000-0000-7000-8000-00000000000b';
const GIFT_A1 = '01890000-0000-7000-8000-0000000000a1';
const GIFT_A2 = '01890000-0000-7000-8000-0000000000a2';
const GIFT_A3 = '01890000-0000-7000-8000-0000000000a3';
const GIFT_B1 = '01890000-0000-7000-8000-0000000000b1';
const NEW_GIFT = '01890000-0000-7000-8000-0000000000a9';
const MEDIA_A = '01890000-0000-7000-8000-0000000000e1';
const MEDIA_B = '01890000-0000-7000-8000-0000000000e2';
const CATEGORY_A = '01890000-0000-7000-8000-0000000000f1';
const CATEGORY_B = '01890000-0000-7000-8000-0000000000f2';
const NOW = new Date('2027-01-10T12:00:00.000Z');

type Row = GiftRecord & { weddingId: string; position: number; deletedAt: Date | null };

const row = (weddingId: string, id: string, position: number, extra: Partial<Row> = {}): Row => ({
  weddingId,
  id,
  position,
  deletedAt: null,
  type: 'VIRTUAL',
  title: `Presente ${position}`,
  description: null,
  mediaId: null,
  categoryId: null,
  priceCents: 10_000,
  quotaPriceCents: null,
  quotaTotal: null,
  quotasSold: 0,
  quotasReserved: 0,
  hideWhenSoldOut: false,
  ...extra,
});

/** Banco falso em memória com o mesmo filtro por casamento e por excluído do repository real. */
function fakeRepository(rows: Row[]) {
  const strip = ({ weddingId: _w, position: _p, deletedAt: _d, ...record }: Row): GiftRecord =>
    record;
  const activeOf = (weddingId: string) =>
    rows
      .filter((r) => r.weddingId === weddingId && !r.deletedAt)
      .sort((a, b) => a.position - b.position);
  return {
    listActive: jest.fn(async (weddingId: string) => activeOf(weddingId).map(strip)),
    findActive: jest.fn(async (weddingId: string, id: string) => {
      const found = activeOf(weddingId).find((r) => r.id === id);
      return found ? strip(found) : null;
    }),
    create: jest.fn(async (weddingId: string, data: GiftData) => {
      const position =
        Math.max(0, ...rows.filter((r) => r.weddingId === weddingId).map((r) => r.position)) + 1;
      const created = { ...row(weddingId, NEW_GIFT, position), ...data };
      rows.push(created);
      return strip(created);
    }),
    update: jest.fn(async (weddingId: string, id: string, data: GiftData) => {
      const found = activeOf(weddingId).find((r) => r.id === id);
      if (!found) return false;
      Object.assign(found, data);
      return true;
    }),
    softDelete: jest.fn(async (weddingId: string, id: string, now: Date) => {
      const found = activeOf(weddingId).find((r) => r.id === id);
      if (!found) return false;
      found.deletedAt = now;
      return true;
    }),
    reorder: jest.fn(async (weddingId: string, ids: string[]) => {
      ids.forEach((id, index) => {
        const found = activeOf(weddingId).find((r) => r.id === id);
        if (found) found.position = index + 1;
      });
    }),
    usesMedia: jest.fn(async (weddingId: string, mediaId: string) =>
      activeOf(weddingId).some((r) => r.mediaId === mediaId),
    ),
    reserveQuotas: jest.fn(async (weddingId: string, id: string, quantity: number) => {
      const found = activeOf(weddingId).find((r) => r.id === id);
      if (!found || found.quotasSold + found.quotasReserved + quantity > found.quotaTotal) {
        return false;
      }
      found.quotasReserved += quantity;
      return true;
    }),
    findTitles: jest.fn(async (weddingId: string, ids: string[]) =>
      rows
        .filter((r) => r.weddingId === weddingId && ids.includes(r.id))
        .map((r) => ({ id: r.id, title: r.title })),
    ),
  };
}

function setup(rows: Row[]) {
  const repository = fakeRepository(rows);
  const categories = {
    exists: jest.fn(
      async (weddingId: string, id: string) => weddingId === WEDDING_A && id === CATEGORY_A,
    ),
    listWithActiveGifts: jest.fn(async () => [{ id: CATEGORY_A, name: 'Casa' }]),
  };
  const checkers: MediaUsageChecker[] = [];
  const media = {
    registerUsageChecker: jest.fn((checker: MediaUsageChecker) => checkers.push(checker)),
    resolve: jest.fn(async (weddingId: string, ids: string[]) =>
      Object.fromEntries(
        ids
          .filter((id) => weddingId === WEDDING_A && id === MEDIA_A)
          .map((id) => [
            id,
            { id, width: 1, height: 1, urls: { sm: 's', md: 'm', lg: 'l', og: 'o' } },
          ]),
      ),
    ),
  };
  const service = new GiftsService(
    repository as unknown as GiftsRepository,
    categories as unknown as GiftCategoriesRepository,
    media as unknown as MediaService,
    { now: () => NOW } as Clock,
  );
  return { service, repository, categories, media, checkers };
}

const catalog = () => [
  row(WEDDING_A, GIFT_A1, 1),
  row(WEDDING_A, GIFT_A2, 2),
  row(WEDDING_A, GIFT_A3, 3),
  row(WEDDING_B, GIFT_B1, 1),
];

describe('GiftsService', () => {
  describe('create', () => {
    it('puts a new gift fourth in a catalog of 3 (RF04)', async () => {
      const { service } = setup(catalog());

      await service.create(WEDDING_A, { type: 'FREE_AMOUNT', title: 'Ajuda na casa' });

      expect((await service.list(WEDDING_A)).map((gift) => gift.id)).toEqual([
        GIFT_A1,
        GIFT_A2,
        GIFT_A3,
        NEW_GIFT,
      ]);
    });

    it('answers with the fields of the type only (RF01)', async () => {
      const { service } = setup([]);

      const created = await service.create(WEDDING_A, {
        type: 'VIRTUAL',
        title: 'Jantar',
        priceCents: 100_000_000,
      });

      expect(created).toEqual({
        id: NEW_GIFT,
        type: 'VIRTUAL',
        title: 'Jantar',
        description: null,
        image: null,
        mediaId: null,
        categoryId: null,
        soldOut: false,
        priceCents: 100_000_000,
        quantityTotal: null,
        quantityAvailable: null,
        hideWhenSoldOut: false,
      });
    });

    it('accepts a photo and a category of the wedding and returns the resolved photo', async () => {
      const { service } = setup([]);

      const created = await service.create(WEDDING_A, {
        type: 'FREE_AMOUNT',
        title: 'Ajuda',
        mediaId: MEDIA_A,
        categoryId: CATEGORY_A,
      });

      expect(created).toMatchObject({ mediaId: MEDIA_A, categoryId: CATEGORY_A });
      expect(created.image?.id).toBe(MEDIA_A);
    });

    it('refuses a photo or a category of another wedding (RF02, RNF01)', async () => {
      const { service, repository } = setup([]);

      await expect(
        service.create(WEDDING_A, { type: 'FREE_AMOUNT', title: 'Ajuda', mediaId: MEDIA_B }),
      ).rejects.toBeInstanceOf(GiftInvalidMedia);
      await expect(
        service.create(WEDDING_A, { type: 'FREE_AMOUNT', title: 'Ajuda', categoryId: CATEGORY_B }),
      ).rejects.toBeInstanceOf(GiftInvalidCategory);
      await expect(
        service.create(WEDDING_B, { type: 'FREE_AMOUNT', title: 'Ajuda', mediaId: MEDIA_A }),
      ).rejects.toBeInstanceOf(GiftInvalidMedia);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('update (RF06)', () => {
    const lockedCatalog = () => [
      row(WEDDING_A, GIFT_A1, 1, {
        type: 'QUOTA',
        priceCents: null,
        quotaPriceCents: 15_000,
        quotaTotal: 10,
        quotasSold: 3,
        quotasReserved: 1,
      }),
    ];
    const quotaInput = { type: 'QUOTA' as const, title: 'Lua de mel', quotaPriceCents: 15_000 };

    it('locks a new quota price and a total below 4 with 3 sold and 1 reserved', async () => {
      const { service, repository } = setup(lockedCatalog());

      await expect(
        service.update(WEDDING_A, GIFT_A1, {
          ...quotaInput,
          quotaPriceCents: 20_000,
          quotaTotal: 10,
        }),
      ).rejects.toBeInstanceOf(GiftLocked);
      await expect(
        service.update(WEDDING_A, GIFT_A1, { ...quotaInput, quotaTotal: 3 }),
      ).rejects.toBeInstanceOf(GiftQuotaTotalTooLow);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('accepts a total of 4 or just a new name, keeping the counters', async () => {
      const { service } = setup(lockedCatalog());

      await service.update(WEDDING_A, GIFT_A1, { ...quotaInput, quotaTotal: 4 });
      const renamed = await service.update(WEDDING_A, GIFT_A1, {
        ...quotaInput,
        title: 'Viagem',
        quotaTotal: 4,
      });

      expect(renamed).toMatchObject({
        title: 'Viagem',
        quotaTotal: 4,
        quotasSold: 3,
        quotasReserved: 1,
        soldOut: true,
      });
    });

    it('checks again when a reservation lands between the read and the conditional write', async () => {
      const rows = lockedCatalog();
      rows[0].quotasReserved = 0;
      const { service, repository } = setup(rows);
      repository.update.mockImplementationOnce(async () => {
        rows[0].quotasReserved = 1; // a 012 reservou mais uma cota
        return false;
      });

      await expect(
        service.update(WEDDING_A, GIFT_A1, { ...quotaInput, quotaTotal: 3 }),
      ).rejects.toBeInstanceOf(GiftQuotaTotalTooLow);
    });

    it('does not find a gift of another wedding, a deleted gift or an invalid id', async () => {
      const rows = catalog();
      rows[1].deletedAt = NOW;
      const { service } = setup(rows);
      const input = { type: 'FREE_AMOUNT' as const, title: 'Ajuda' };

      await expect(service.update(WEDDING_A, GIFT_B1, input)).rejects.toBeInstanceOf(GiftNotFound);
      await expect(service.update(WEDDING_A, GIFT_A2, input)).rejects.toBeInstanceOf(GiftNotFound);
      await expect(service.update(WEDDING_A, 'abc', input)).rejects.toBeInstanceOf(GiftNotFound);
    });
  });

  describe('delete (RF05)', () => {
    it('hides the gift from the panel and the showcase and frees its photo', async () => {
      const rows = catalog();
      rows[0].mediaId = MEDIA_A;
      const { service, checkers } = setup(rows);
      service.onModuleInit();
      const giftsChecker = checkers.find((checker) => checker.place === 'gifts');

      await expect(giftsChecker.isInUse(WEDDING_A, MEDIA_A)).resolves.toBe(true);
      await service.delete(WEDDING_A, GIFT_A1);

      expect(rows[0].deletedAt).toEqual(NOW);
      expect((await service.list(WEDDING_A)).map((gift) => gift.id)).toEqual([GIFT_A2, GIFT_A3]);
      expect((await service.getShowcase(WEDDING_A)).gifts.map((gift) => gift.id)).toEqual([
        GIFT_A2,
        GIFT_A3,
      ]);
      await expect(giftsChecker.isInUse(WEDDING_A, MEDIA_A)).resolves.toBe(false);
    });

    it('never deletes a gift of another wedding', async () => {
      const rows = catalog();
      const { service } = setup(rows);

      await expect(service.delete(WEDDING_A, GIFT_B1)).rejects.toBeInstanceOf(GiftNotFound);
      expect(rows[3].deletedAt).toBeNull();
    });
  });

  describe('reorder (RF04)', () => {
    it('saves a new order with each active gift once', async () => {
      const { service } = setup(catalog());

      await service.reorder(WEDDING_A, [GIFT_A3, GIFT_A1, GIFT_A2]);

      expect((await service.list(WEDDING_A)).map((gift) => gift.id)).toEqual([
        GIFT_A3,
        GIFT_A1,
        GIFT_A2,
      ]);
    });

    it.each([
      ['omits a gift', [GIFT_A1, GIFT_A2]],
      ['repeats a gift', [GIFT_A1, GIFT_A2, GIFT_A2]],
      ['brings a gift of another wedding', [GIFT_A1, GIFT_A2, GIFT_B1]],
      ['brings an extra gift of another wedding', [GIFT_A1, GIFT_A2, GIFT_A3, GIFT_B1]],
    ])('refuses an order that %s and keeps the previous one', async (_case, ids) => {
      const { service, repository } = setup(catalog());

      await expect(service.reorder(WEDDING_A, ids)).rejects.toBeInstanceOf(GiftInvalidOrder);
      expect(repository.reorder).not.toHaveBeenCalled();
      expect((await service.list(WEDDING_A)).map((gift) => gift.id)).toEqual([
        GIFT_A1,
        GIFT_A2,
        GIFT_A3,
      ]);
    });
  });

  describe('getShowcase', () => {
    it('lists only the active gifts of the wedding, in catalog order, with the categories in use', async () => {
      const rows = catalog();
      rows[0].position = 9;
      const { service, categories } = setup(rows);

      const showcase = await service.getShowcase(WEDDING_A);

      expect(showcase.gifts.map((gift) => gift.id)).toEqual([GIFT_A2, GIFT_A3, GIFT_A1]);
      expect(showcase.categories).toEqual([{ id: CATEGORY_A, name: 'Casa' }]);
      expect(categories.listWithActiveGifts).toHaveBeenCalledWith(WEDDING_A);
    });

    it('shows a new gift on the next read, without publishing the site (RF08)', async () => {
      const { service } = setup([]);

      await service.create(WEDDING_A, {
        type: 'QUOTA',
        title: 'Lua de mel',
        quotaPriceCents: 15_000,
        quotaTotal: 10,
      });

      expect((await service.getShowcase(WEDDING_A)).gifts).toHaveLength(1);
    });

    it('resolves the photos in one batch', async () => {
      const rows = catalog();
      rows[0].mediaId = MEDIA_A;
      rows[1].mediaId = MEDIA_A;
      const { service, media } = setup(rows);

      await service.getShowcase(WEDDING_A);

      expect(media.resolve).toHaveBeenCalledTimes(1);
      expect(media.resolve).toHaveBeenCalledWith(WEDDING_A, [MEDIA_A, MEDIA_A]);
    });
  });

  it('registers the gifts usage checker in the media service', () => {
    const { service, media } = setup([]);

    service.onModuleInit();

    expect(media.registerUsageChecker).toHaveBeenCalledWith(
      expect.objectContaining({ place: 'gifts' }),
    );
  });

  describe('checkout operations for payments (spec 012)', () => {
    const withQuota = (extra: Partial<Row> = {}) =>
      row(WEDDING_A, GIFT_A1, 1, {
        type: 'QUOTA',
        priceCents: null,
        quotaPriceCents: 15_000,
        quotaTotal: 10,
        quotasSold: 8,
        quotasReserved: 1,
        ...extra,
      });
    const tx = {} as never;

    it('prices quotas, fixed price and free amount on the server', async () => {
      const { service } = setup([
        withQuota(),
        row(WEDDING_A, GIFT_A2, 2),
        row(WEDDING_A, GIFT_A3, 3, { type: 'FREE_AMOUNT', priceCents: null }),
      ]);

      await expect(service.quoteForCheckout(WEDDING_A, GIFT_A1, { quantity: 1 })).resolves.toEqual({
        giftId: GIFT_A1,
        title: 'Presente 1',
        quantity: 1,
        priceCents: 15_000,
      });
      await expect(
        service.quoteForCheckout(WEDDING_A, GIFT_A2, { quantity: 5, amountCents: 1 }),
      ).resolves.toMatchObject({ quantity: 1, priceCents: 10_000 });
      await expect(
        service.quoteForCheckout(WEDDING_A, GIFT_A3, { amountCents: 7_777 }),
      ).resolves.toMatchObject({ quantity: 1, priceCents: 7_777 });
      await expect(service.quoteForCheckout(WEDDING_A, GIFT_A3, {})).rejects.toBeInstanceOf(
        GiftInvalidAmount,
      );
    });

    it('refuses more quotas than are free with gift.sold_out', async () => {
      const { service } = setup([withQuota()]);

      await expect(
        service.quoteForCheckout(WEDDING_A, GIFT_A1, { quantity: 2 }),
      ).rejects.toBeInstanceOf(GiftSoldOut);
      await expect(
        service.reserveForCheckout(WEDDING_A, GIFT_A1, { quantity: 2 }, tx),
      ).rejects.toBeInstanceOf(GiftSoldOut);
    });

    it('reserves the free quota and then sells out', async () => {
      const rows = [withQuota()];
      const { service } = setup(rows);

      await service.reserveForCheckout(WEDDING_A, GIFT_A1, { quantity: 1 }, tx);

      expect(rows[0].quotasReserved).toBe(2);
      expect((await service.getShowcase(WEDDING_A)).gifts[0].soldOut).toBe(true);
      await expect(
        service.reserveForCheckout(WEDDING_A, GIFT_A1, { quantity: 1 }, tx),
      ).rejects.toBeInstanceOf(GiftSoldOut);
    });

    describe('fixed price with quantity (spec 018)', () => {
      const tickets = (extra: Partial<Row> = {}) =>
        row(WEDDING_A, GIFT_A1, 1, { title: 'Passagem', quotaTotal: 2, ...extra });

      it('prices the chosen units and refuses more than are free (RF03, RF04)', async () => {
        const { service } = setup([tickets({ quotasSold: 1 })]);

        await expect(
          service.quoteForCheckout(WEDDING_A, GIFT_A1, { quantity: 1 }),
        ).resolves.toMatchObject({ quantity: 1, priceCents: 10_000 });
        await expect(
          service.quoteForCheckout(WEDDING_A, GIFT_A1, { quantity: 2 }),
        ).rejects.toBeInstanceOf(GiftSoldOut);
      });

      it('reserves both units at once and then shows the gift as given', async () => {
        const rows = [tickets()];
        const { service } = setup(rows);

        await expect(
          service.reserveForCheckout(WEDDING_A, GIFT_A1, { quantity: 2 }, tx),
        ).resolves.toMatchObject({ quantity: 2, priceCents: 20_000 });

        expect(rows[0].quotasReserved).toBe(2);
        expect((await service.getShowcase(WEDDING_A)).gifts[0]).toMatchObject({
          soldOut: true,
          quantityTotal: 2,
          quantityAvailable: 0,
        });
      });

      it('hides a sold out gift from the site when asked, keeping it in the panel (RF06)', async () => {
        const rows = [
          tickets({ quotasSold: 2, hideWhenSoldOut: true, categoryId: CATEGORY_A }),
          row(WEDDING_A, GIFT_A2, 2, { quotaTotal: 1, quotasSold: 1 }),
        ];
        const { service } = setup(rows);

        const showcase = await service.getShowcase(WEDDING_A);

        expect(showcase.gifts.map((gift) => gift.id)).toEqual([GIFT_A2]);
        expect(showcase.gifts[0].soldOut).toBe(true);
        expect(showcase.categories).toEqual([]);
        expect((await service.list(WEDDING_A)).map((gift) => gift.id)).toEqual([GIFT_A1, GIFT_A2]);
      });
    });

    it('never reserves a fixed price gift, a deleted gift or a gift of another wedding', async () => {
      const rows = [row(WEDDING_A, GIFT_A2, 2), withQuota({ deletedAt: NOW })];
      const { service, repository } = setup([...rows, row(WEDDING_B, GIFT_B1, 1)]);

      await service.reserveForCheckout(WEDDING_A, GIFT_A2, {}, tx);
      expect(repository.reserveQuotas).not.toHaveBeenCalled();
      await expect(
        service.reserveForCheckout(WEDDING_A, GIFT_A1, { quantity: 1 }, tx),
      ).rejects.toBeInstanceOf(GiftNotFound);
      await expect(service.reserveForCheckout(WEDDING_A, GIFT_B1, {}, tx)).rejects.toBeInstanceOf(
        GiftNotFound,
      );
    });

    it('gives the titles of deleted gifts to Received', async () => {
      const rows = catalog();
      rows[0].deletedAt = NOW;
      const { service } = setup(rows);

      await expect(service.getTitles(WEDDING_A, [GIFT_A1, GIFT_B1])).resolves.toEqual({
        [GIFT_A1]: 'Presente 1',
      });
    });
  });
});
