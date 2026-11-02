import { GiftLocked, GiftQuotaTotalTooLow } from './errors/gift-errors';
import { assertQuotaEdit, toGiftData, toPanelGift, toShowcaseGift } from './gift-rules';
import type { GiftRecord } from './gifts.repository';

const GIFT_ID = '01890000-0000-7000-8000-0000000000c1';
const MEDIA_ID = '01890000-0000-7000-8000-0000000000d1';

const quotaGift = (overrides: Partial<GiftRecord> = {}): GiftRecord => ({
  id: GIFT_ID,
  type: 'QUOTA',
  title: 'Lua de mel',
  description: null,
  mediaId: null,
  categoryId: null,
  priceCents: null,
  quotaPriceCents: 15_000,
  quotaTotal: 10,
  quotasSold: 3,
  quotasReserved: 1,
  hideWhenSoldOut: false,
  ...overrides,
});

const edit = (overrides: Record<string, unknown>) =>
  toGiftData({
    type: 'QUOTA',
    title: 'Lua de mel',
    quotaPriceCents: 15_000,
    quotaTotal: 10,
    ...overrides,
  } as never);

describe('toGiftData', () => {
  it('keeps only the fields of the type, the rest null', () => {
    expect(
      toGiftData({ type: 'VIRTUAL', title: 'Jantar', priceCents: 500, quotaTotal: 3 }),
    ).toEqual({
      type: 'VIRTUAL',
      title: 'Jantar',
      description: null,
      mediaId: null,
      categoryId: null,
      priceCents: 500,
      quotaPriceCents: null,
      quotaTotal: null,
      hideWhenSoldOut: false,
    });
  });
});

describe('fixed price with quantity (spec 018)', () => {
  const tickets = (overrides: Partial<GiftRecord> = {}) =>
    quotaGift({
      type: 'VIRTUAL',
      priceCents: 30_000,
      quotaPriceCents: null,
      quotaTotal: 2,
      quotasSold: 1,
      quotasReserved: 0,
      ...overrides,
    });

  it('keeps the quantity and the sold out option of a fixed price gift (RF01)', () => {
    expect(
      toGiftData({
        type: 'VIRTUAL',
        title: 'Passagem',
        priceCents: 30_000,
        quantityTotal: 2,
        hideWhenSoldOut: true,
      }),
    ).toMatchObject({ priceCents: 30_000, quotaTotal: 2, hideWhenSoldOut: true });
    expect(toGiftData({ type: 'VIRTUAL', title: 'Jantar', priceCents: 500 }).quotaTotal).toBeNull();
  });

  it('locks a quantity below the given units, removing the limit and changing the type (RF02)', () => {
    const edit = (changes: Record<string, unknown>) =>
      toGiftData({ type: 'VIRTUAL', title: 'x', priceCents: 1, quantityTotal: 2, ...changes });

    expect(() =>
      assertQuotaEdit(tickets({ quotasReserved: 1 }), edit({ quantityTotal: 1 })),
    ).toThrow(GiftQuotaTotalTooLow);
    expect(() => assertQuotaEdit(tickets(), edit({ quantityTotal: null }))).toThrow(GiftLocked);
    expect(() =>
      assertQuotaEdit(tickets(), toGiftData({ type: 'FREE_AMOUNT', title: 'x' })),
    ).toThrow(GiftLocked);
    expect(() =>
      assertQuotaEdit(tickets(), edit({ priceCents: 35_000, quantityTotal: 3 })),
    ).not.toThrow();
    expect(() =>
      assertQuotaEdit(tickets({ quotasSold: 0 }), edit({ quantityTotal: null })),
    ).not.toThrow();
  });

  it('shows the free units and sells out at zero; without limit it never sells out', () => {
    expect(toShowcaseGift(tickets(), {})).toMatchObject({
      quantityTotal: 2,
      quantityAvailable: 1,
      soldOut: false,
    });
    expect(toShowcaseGift(tickets({ quotasReserved: 1 }), {}).soldOut).toBe(true);
    expect(toShowcaseGift(tickets({ quotaTotal: null, quotasSold: 0 }), {})).toMatchObject({
      quantityTotal: null,
      quantityAvailable: null,
      soldOut: false,
    });
  });
});

describe('assertQuotaEdit (RF06)', () => {
  const sold3reserved1 = quotaGift();

  it('locks the quota price and the type with 3 sold and 1 reserved', () => {
    expect(() => assertQuotaEdit(sold3reserved1, edit({ quotaPriceCents: 20_000 }))).toThrow(
      GiftLocked,
    );
    expect(() =>
      assertQuotaEdit(sold3reserved1, toGiftData({ type: 'VIRTUAL', title: 'x', priceCents: 1 })),
    ).toThrow(GiftLocked);
  });

  it('refuses a total below sold + reserved and accepts exactly them', () => {
    expect(() => assertQuotaEdit(sold3reserved1, edit({ quotaTotal: 3 }))).toThrow(
      GiftQuotaTotalTooLow,
    );
    expect(() => assertQuotaEdit(sold3reserved1, edit({ quotaTotal: 4 }))).not.toThrow();
  });

  it('accepts only a new name', () => {
    expect(() => assertQuotaEdit(sold3reserved1, edit({ title: 'Viagem a Paris' }))).not.toThrow();
  });

  it('frees everything while no quota is sold or reserved', () => {
    const untouched = quotaGift({ quotasSold: 0, quotasReserved: 0 });

    expect(() =>
      assertQuotaEdit(untouched, toGiftData({ type: 'FREE_AMOUNT', title: 'Ajuda' })),
    ).not.toThrow();
    expect(() =>
      assertQuotaEdit(untouched, edit({ quotaPriceCents: 1, quotaTotal: 1 })),
    ).not.toThrow();
  });
});

describe('toShowcaseGift', () => {
  it('computes collected and goal in cents on the API (RF08)', () => {
    const view = toShowcaseGift(quotaGift({ quotasReserved: 0 }), {});

    expect(view).toEqual({
      id: GIFT_ID,
      type: 'QUOTA',
      title: 'Lua de mel',
      description: null,
      image: null,
      categoryId: null,
      soldOut: false,
      quotaPriceCents: 15_000,
      quotaTotal: 10,
      quotasAvailable: 7,
      collectedCents: 45_000,
      goalCents: 150_000,
    });
  });

  it('shows a quota gift as sold out when sold + reserved reach the total (RF10)', () => {
    expect(toShowcaseGift(quotaGift({ quotasSold: 9, quotasReserved: 1 }), {})).toMatchObject({
      soldOut: true,
      quotasAvailable: 0,
    });
  });

  it('never sells out virtual and free amount gifts, and keeps only the fields of the type', () => {
    const virtual = toShowcaseGift(
      quotaGift({ type: 'VIRTUAL', priceCents: 30_000, quotaPriceCents: null, quotaTotal: null }),
      {},
    );
    const free = toShowcaseGift(
      quotaGift({ type: 'FREE_AMOUNT', quotaPriceCents: null, quotaTotal: null }),
      {},
    );

    expect(virtual).toMatchObject({ soldOut: false, priceCents: 30_000 });
    expect(Object.keys(virtual)).not.toContain('quotaTotal');
    expect(free.soldOut).toBe(false);
    expect(Object.keys(free)).not.toContain('priceCents');
  });

  it('resolves the photo from the media map and drops a photo that no longer resolves', () => {
    const media = {
      [MEDIA_ID]: {
        id: MEDIA_ID,
        width: 10,
        height: 10,
        urls: { sm: 'a', md: 'b', lg: 'c', og: 'd' },
      },
    };

    expect(toShowcaseGift(quotaGift({ mediaId: MEDIA_ID }), media).image).toBe(media[MEDIA_ID]);
    expect(toShowcaseGift(quotaGift({ mediaId: GIFT_ID }), media).image).toBeNull();
  });
});

describe('toPanelGift', () => {
  it('adds the media id and the counters of the quota to the showcase view', () => {
    expect(toPanelGift(quotaGift({ mediaId: MEDIA_ID }), {})).toMatchObject({
      mediaId: MEDIA_ID,
      quotasSold: 3,
      quotasReserved: 1,
    });
  });
});
