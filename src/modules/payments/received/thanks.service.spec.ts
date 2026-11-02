import { paymentsHarness, WEDDING_A, WEDDING_B } from '../../../common/testing/payments-harness';
import type { WeddingsService } from '../../weddings/weddings.service';
import { ContributionNotFound, ContributionThanksNotOpen } from '../errors/payment-errors';
import { ThanksService } from './thanks.service';

// Harness começa em 10/01/2027; o casamento é em 10/03/2027 19h UTC.
const WEDDING_DATE = new Date('2027-03-10T19:00:00.000Z');
const DAY = 24 * 3600_000;

describe('ThanksService (spec 014)', () => {
  async function setup(isAnonymous = false) {
    const h = paymentsHarness();
    const weddings = { getDetails: jest.fn(async () => ({ weddingDate: WEDDING_DATE })) };
    const thanks = new ThanksService(h.received, weddings as unknown as WeddingsService, {
      now: () => h.now(),
    });
    h.connect(WEDDING_A);
    const gift = h.addGift({ weddingId: WEDDING_A, title: 'Jantar' });
    const created = await h.checkout.createOrder(
      WEDDING_A,
      h.orderInput(gift.id, { method: 'CARD', isAnonymous }),
    );
    await h.checkout.payWithCard(WEDDING_A, created.orderId, {
      cardToken: 't',
      paymentMethodId: 'visa',
      issuerId: null,
      installments: 1,
    });
    const order = h.db.orders.find((row) => row.id === created.orderId);
    const toAfterWedding = () => h.advance(WEDDING_DATE.getTime() - h.now().getTime() + 1000);
    return { h, thanks, weddings, gift, order, orderId: created.orderId, toAfterWedding };
  }

  it('refuses before the date with contribution.thanks_not_open, without touching the order (RF08)', async () => {
    const { thanks, order, orderId } = await setup();

    const error = await thanks.mark(WEDDING_A, orderId).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ContributionThanksNotOpen);
    expect(error).toMatchObject({ status: 409, code: 'contribution.thanks_not_open' });
    await expect(thanks.unmark(WEDDING_A, orderId)).rejects.toBeInstanceOf(
      ContributionThanksNotOpen,
    );
    expect(order.thankedAt).toBeNull();
  });

  it('marks after the date, keeps the first instant when marked again and unmarks (RF07)', async () => {
    const { h, thanks, weddings, order, orderId, toAfterWedding } = await setup();
    toAfterWedding();
    const first = h.now();

    await thanks.mark(WEDDING_A, orderId);
    h.advance(DAY);
    await thanks.mark(WEDDING_A, orderId);

    expect(order.thankedAt).toEqual(first);
    expect(weddings.getDetails).toHaveBeenCalledWith(WEDDING_A);

    await thanks.unmark(WEDDING_A, orderId);
    expect(order.thankedAt).toBeNull();
  });

  it('answers contribution.not_found for an order of another wedding or not approved (RF08, RNF01)', async () => {
    const { h, thanks, gift, order, orderId, toAfterWedding } = await setup();
    const pending = await h.checkout.createOrder(WEDDING_A, h.orderInput(gift.id));
    toAfterWedding();

    for (const [weddingId, id] of [
      [WEDDING_B, orderId],
      [WEDDING_A, pending.orderId],
      [WEDDING_A, 'not-a-uuid'],
    ]) {
      const error = await thanks.mark(weddingId, id).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ContributionNotFound);
      expect(error).toMatchObject({ status: 404, code: 'contribution.not_found' });
    }
    expect(order.thankedAt).toBeNull();
    expect(h.db.orders.every((row) => row.thankedAt === null)).toBe(true);
  });

  it('gives the editor only gift, giver ("Anônimo" when chosen) and thanked (RF09)', async () => {
    const { thanks, orderId, toAfterWedding } = await setup(true);
    toAfterWedding();
    await thanks.mark(WEDDING_A, orderId);

    const list = await thanks.listForEditor(WEDDING_A);

    expect(list).toEqual({
      weddingDate: WEDDING_DATE,
      items: [{ orderId, giftTitle: 'Jantar', giver: 'Anônimo', thanked: true }],
    });
    expect(JSON.stringify(list)).not.toMatch(/Felicidades|carla@|52998224725|Cents/);
    await expect(thanks.listForEditor(WEDDING_B)).resolves.toMatchObject({ items: [] });
  });
});
