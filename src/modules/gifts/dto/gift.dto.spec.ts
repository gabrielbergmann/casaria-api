import { GiftInputSchema } from './gift.dto';

describe('GiftInputSchema', () => {
  const parse = (input: Record<string, unknown>) => GiftInputSchema.safeParse(input);

  it('accepts each type with only a name and its value (RF01)', () => {
    expect(parse({ type: 'VIRTUAL', title: 'Jantar', priceCents: 1 }).success).toBe(true);
    expect(parse({ type: 'VIRTUAL', title: 'Viagem', priceCents: 100_000_000 }).success).toBe(true);
    expect(
      parse({ type: 'QUOTA', title: 'Lua de mel', quotaPriceCents: 15_000, quotaTotal: 10 })
        .success,
    ).toBe(true);
    expect(parse({ type: 'FREE_AMOUNT', title: 'Ajuda na casa' }).success).toBe(true);
  });

  it.each([199.9, 0, -100])('rejects priceCents %p (RF02)', (priceCents) => {
    expect(parse({ type: 'VIRTUAL', title: 'Jantar', priceCents }).success).toBe(false);
  });

  it('rejects a quota gift without quotaTotal and a virtual one without price (RF02)', () => {
    const quota = parse({ type: 'QUOTA', title: 'Lua de mel', quotaPriceCents: 15_000 });
    const virtual = parse({ type: 'VIRTUAL', title: 'Jantar' });

    expect(quota.success).toBe(false);
    expect(quota.error?.issues.map((issue) => issue.path)).toEqual([['quotaTotal']]);
    expect(virtual.error?.issues.map((issue) => issue.path)).toEqual([['priceCents']]);
  });

  it('rejects an empty name, an unknown type and a photo id that is not a uuid', () => {
    expect(parse({ type: 'FREE_AMOUNT', title: '  ' }).success).toBe(false);
    expect(parse({ type: 'PHYSICAL', title: 'Panela' }).success).toBe(false);
    expect(parse({ type: 'FREE_AMOUNT', title: 'Ajuda', mediaId: 'foto' }).success).toBe(false);
  });

  it('turns an empty description into null', () => {
    const result = parse({ type: 'FREE_AMOUNT', title: 'Ajuda', description: '  ' });

    expect(result.data?.description).toBeNull();
  });
});
