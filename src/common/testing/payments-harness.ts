import { randomBytes, randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type {
  DisconnectReason,
  GiftType,
  OrderStatus,
  PaymentMethod,
  PixKeyType,
} from '../../generated/prisma/enums';
import type { Env } from '../../infra/config/env.schema';
import type { TransactionRunner, Tx } from '../../infra/prisma/transaction-runner';
import type { MembersService } from '../../modules/auth/members.service';
import {
  GiftInvalidAmount,
  GiftNotFound,
  GiftSoldOut,
} from '../../modules/gifts/errors/gift-errors';
import type { CheckoutRequest, GiftsService } from '../../modules/gifts/gifts.service';
import type {
  EncryptedTokens,
  PaymentAccountRecord,
  PaymentAccountsRepository,
} from '../../modules/payments/accounts/payment-accounts.repository';
import { PaymentAccountsService } from '../../modules/payments/accounts/payment-accounts.service';
import type { FeeConfig } from '../../modules/payments/fees/fee-calculator';
import type { PaymentFeesRepository } from '../../modules/payments/fees/payment-fees.repository';
import { PaymentFeesService } from '../../modules/payments/fees/payment-fees.service';
import { CheckoutService } from '../../modules/payments/orders/checkout.service';
import { OrderSyncService } from '../../modules/payments/orders/order-sync.service';
import { OrderTransitionsService } from '../../modules/payments/orders/order-transitions.service';
import type {
  NewOrder,
  OrderRecord,
  OrdersRepository,
} from '../../modules/payments/orders/orders.repository';
import type {
  PixKeyRecord,
  PixKeysRepository,
} from '../../modules/payments/pix/pix-keys.repository';
import { PixKeysService } from '../../modules/payments/pix/pix-keys.service';
import { DirectPixReviewService } from '../../modules/payments/received/direct-pix-review.service';
import { ReceivedGiftsService } from '../../modules/payments/received/received-gifts.service';
import type { WeddingsService } from '../../modules/weddings/weddings.service';
import type { WebhookEventsRepository } from '../../modules/payments/webhooks/webhook-events.repository';
import { MercadoPagoWebhookService } from '../../modules/payments/webhooks/mercadopago-webhook.service';
import type { AuditService } from '../audit/audit.service';
import { CryptoService } from '../crypto/crypto.service';
import type { Clock } from '../time/clock';
import { FakePaymentProvider } from './fake-payment-provider';

// Ambiente dos testes de pagamentos (spec 012 RNF03): services reais sobre "tabelas" em memória
// que filtram por weddingId como os repositories, com o FakePaymentProvider no lugar do Mercado
// Pago. Nada de banco, Redis ou rede.

export const WEDDING_A = '01890000-0000-7000-8000-00000000000a';
export const WEDDING_B = '01890000-0000-7000-8000-00000000000b';
export const OWNER = { id: 'user-owner', isSuperadmin: false };

export interface GiftRow {
  weddingId: string;
  id: string;
  type: GiftType;
  title: string;
  priceCents: number | null;
  quotaPriceCents: number | null;
  quotaTotal: number | null;
  quotasSold: number;
  quotasReserved: number;
  deleted: boolean;
}

export type OrderRow = OrderRecord &
  Omit<NewOrder, keyof OrderRecord> & {
    weddingId: string;
    installments: number | null;
    approvedAt: Date | null;
    thankedAt: Date | null;
    createdAt: Date;
  };

export type AccountRow = PaymentAccountRecord & { weddingId: string };

export const quotaGift = (overrides: Partial<GiftRow> = {}): GiftRow => ({
  weddingId: WEDDING_A,
  id: randomUUID(),
  type: 'QUOTA',
  title: 'Lua de mel',
  priceCents: null,
  quotaPriceCents: 10_000,
  quotaTotal: 10,
  quotasSold: 0,
  quotasReserved: 0,
  deleted: false,
  ...overrides,
});

export const fakeLogger = () =>
  ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    assign: jest.fn(),
    runInContext: jest.fn(async (fn: () => Promise<void>) => fn()),
  }) as unknown as PinoLogger & Record<'info' | 'warn' | 'error', jest.Mock>;

function fakeGifts(rows: GiftRow[]) {
  const find = (weddingId: string, giftId: string) =>
    rows.find((gift) => gift.weddingId === weddingId && gift.id === giftId);
  const active = (weddingId: string, giftId: string) => {
    const gift = find(weddingId, giftId);
    if (!gift || gift.deleted) throw new GiftNotFound();
    return gift;
  };
  // Cota e preço fixo com quantidade (spec 018) têm total e contadores; o resto não esgota.
  const limited = (gift: GiftRow) => gift.quotaTotal !== null;
  const price = (gift: GiftRow, request: CheckoutRequest) => {
    const base = { giftId: gift.id, title: gift.title };
    if (gift.type === 'VIRTUAL' || gift.type === 'QUOTA') {
      const quantity = limited(gift) ? (request.quantity ?? 1) : 1;
      const unit = gift.type === 'VIRTUAL' ? gift.priceCents : gift.quotaPriceCents;
      return { ...base, quantity, priceCents: quantity * unit };
    }
    if (!request.amountCents) throw new GiftInvalidAmount();
    return { ...base, quantity: 1, priceCents: request.amountCents };
  };
  const free = (gift: GiftRow) => gift.quotaTotal - gift.quotasSold - gift.quotasReserved;
  // Mesma semântica dos UPDATE condicionais do GiftsRepository, sem await no meio.
  const update = (
    weddingId: string,
    giftId: string,
    ok: (g: GiftRow) => boolean,
    change: (g: GiftRow) => void,
  ) => {
    const gift = find(weddingId, giftId);
    if (!gift || !limited(gift) || !ok(gift)) return false;
    change(gift);
    return true;
  };
  return {
    quoteForCheckout: jest.fn(
      async (weddingId: string, giftId: string, request: CheckoutRequest) => {
        const gift = active(weddingId, giftId);
        const quote = price(gift, request);
        if (limited(gift) && quote.quantity > free(gift)) throw new GiftSoldOut();
        return quote;
      },
    ),
    reserveForCheckout: jest.fn(
      async (weddingId: string, giftId: string, request: CheckoutRequest, _tx: Tx) => {
        const gift = active(weddingId, giftId);
        const quote = price(gift, request);
        if (limited(gift)) {
          if (quote.quantity > free(gift)) throw new GiftSoldOut();
          gift.quotasReserved += quote.quantity;
        }
        return quote;
      },
    ),
    confirmQuotas: jest.fn(async (weddingId: string, giftId: string, quantity: number) =>
      update(
        weddingId,
        giftId,
        (g) => g.quotasReserved >= quantity,
        (g) => {
          g.quotasSold += quantity;
          g.quotasReserved -= quantity;
        },
      ),
    ),
    releaseReservation: jest.fn(async (weddingId: string, giftId: string, quantity: number) =>
      update(
        weddingId,
        giftId,
        (g) => g.quotasReserved >= quantity,
        (g) => {
          g.quotasReserved -= quantity;
        },
      ),
    ),
    releaseSold: jest.fn(async (weddingId: string, giftId: string, quantity: number) =>
      update(
        weddingId,
        giftId,
        (g) => g.quotasSold >= quantity,
        (g) => {
          g.quotasSold -= quantity;
        },
      ),
    ),
    getTitles: jest.fn(async (weddingId: string, giftIds: string[]) =>
      Object.fromEntries(
        rows
          .filter((gift) => gift.weddingId === weddingId && giftIds.includes(gift.id))
          .map((gift) => [gift.id, gift.title]),
      ),
    ),
  };
}

function fakeOrders(rows: OrderRow[], clock: { now: () => Date }) {
  const find = (weddingId: string, orderId: string) =>
    rows.find((order) => order.weddingId === weddingId && order.id === orderId) ?? null;
  return {
    createPending: jest.fn(async (weddingId: string, data: NewOrder) => {
      const row: OrderRow = {
        ...data,
        weddingId,
        id: randomUUID(),
        status: 'PENDING',
        providerPaymentId: null,
        installments: null,
        approvedAt: null,
        thankedAt: null,
        createdAt: clock.now(),
      };
      rows.push(row);
      return { ...row };
    }),
    find: jest.fn(async (weddingId: string, orderId: string) => {
      const row = find(weddingId, orderId);
      return row ? { ...row } : null;
    }),
    setProviderPayment: jest.fn(
      async (weddingId: string, orderId: string, id: string, installments: number | null) => {
        const row = find(weddingId, orderId);
        if (!row || row.providerPaymentId) return false;
        Object.assign(row, { providerPaymentId: id, installments });
        return true;
      },
    ),
    transition: jest.fn(
      async (
        weddingId: string,
        orderId: string,
        from: OrderStatus,
        to: OrderStatus,
        approvedAt: Date | null,
      ) => {
        const row = find(weddingId, orderId);
        if (!row || row.status !== from) return false;
        row.status = to;
        if (approvedAt) row.approvedAt = approvedAt;
        return true;
      },
    ),
    listExpiredPending: jest.fn(async (weddingId: string, now: Date) =>
      rows
        .filter(
          (o) =>
            o.weddingId === weddingId && o.status === 'PENDING' && o.reservationExpiresAt < now,
        )
        .map((o) => ({ ...o })),
    ),
    listToReconcile: jest.fn(async (weddingId: string, since: Date) =>
      rows
        .filter(
          (o) =>
            o.weddingId === weddingId &&
            o.providerPaymentId !== null &&
            ['PENDING', 'IN_PROCESS', 'APPROVED'].includes(o.status) &&
            o.createdAt >= since,
        )
        .map((o) => ({ ...o })),
    ),
    listAwaiting: jest.fn(async (weddingId: string) =>
      rows
        .filter((o) => o.weddingId === weddingId && o.status === 'AWAITING_CONFIRMATION')
        .map((o) => ({ ...o })),
    ),
    listReceived: jest.fn(async (weddingId: string) =>
      rows
        .filter((o) => o.weddingId === weddingId && o.approvedAt !== null)
        .sort((a, b) => b.approvedAt.getTime() - a.approvedAt.getTime())
        .map((o) => ({ ...o })),
    ),
    setThanked: jest.fn(async (weddingId: string, orderId: string, thankedAt: Date | null) => {
      const row = find(weddingId, orderId);
      if (!row?.approvedAt) return false;
      // Marcar de novo mantém o primeiro instante (spec 014 RF07).
      row.thankedAt = thankedAt && row.thankedAt ? row.thankedAt : thankedAt;
      return true;
    }),
    findByProviderPaymentId: jest.fn(async (providerPaymentId: string) => {
      const row = rows.find(
        (o) => o.providerPaymentId?.toLowerCase() === providerPaymentId.toLowerCase(),
      );
      return row ? { id: row.id, weddingId: row.weddingId } : null;
    }),
  };
}

function fakePixKeys(rows: ({ weddingId: string } & PixKeyRecord)[]) {
  const find = (weddingId: string) => rows.find((row) => row.weddingId === weddingId);
  return {
    find: jest.fn(async (weddingId: string) => {
      const row = find(weddingId);
      return row ? { keyType: row.keyType, key: row.key } : null;
    }),
    save: jest.fn(async (weddingId: string, pixKey: PixKeyRecord) => {
      const row = find(weddingId);
      if (row) Object.assign(row, pixKey);
      else rows.push({ weddingId, ...pixKey });
    }),
    remove: jest.fn(async (weddingId: string) => {
      const index = rows.findIndex((row) => row.weddingId === weddingId);
      if (index === -1) return false;
      rows.splice(index, 1);
      return true;
    }),
  };
}

function fakeAccounts(rows: AccountRow[]) {
  const find = (weddingId: string) => rows.find((row) => row.weddingId === weddingId);
  const strip = ({ weddingId: _w, ...record }: AccountRow): PaymentAccountRecord => ({ ...record });
  return {
    find: jest.fn(async (weddingId: string) => {
      const row = find(weddingId);
      return row ? strip(row) : null;
    }),
    saveConnected: jest.fn(
      async (
        weddingId: string,
        data: EncryptedTokens & { providerUserId: string; publicKey: string; connectedAt: Date },
      ) => {
        const row = find(weddingId);
        const connected = {
          ...data,
          status: 'CONNECTED' as const,
          disconnectReason: null,
          disconnectedAt: null,
        };
        if (row) Object.assign(row, connected);
        else rows.push({ weddingId, ...connected });
      },
    ),
    saveRefreshed: jest.fn(async (weddingId: string, used: string, data: Partial<AccountRow>) => {
      const row = find(weddingId);
      if (!row || row.status !== 'CONNECTED' || row.refreshTokenEnc !== used) return false;
      Object.assign(row, data);
      return true;
    }),
    disconnect: jest.fn(
      async (weddingId: string, reason: DisconnectReason, now: Date, used?: string) => {
        const row = find(weddingId);
        if (!row || row.status !== 'CONNECTED' || (used && row.refreshTokenEnc !== used))
          return false;
        Object.assign(row, {
          status: 'DISCONNECTED',
          disconnectReason: reason,
          disconnectedAt: now,
          accessTokenEnc: null,
          refreshTokenEnc: null,
          expiresAt: null,
        });
        return true;
      },
    ),
    findConnectedWeddingIds: jest.fn(async (providerUserId: string) =>
      rows
        .filter((row) => row.providerUserId === providerUserId && row.status === 'CONNECTED')
        .map((row) => row.weddingId),
    ),
  };
}

function fakeFees(rows: ({ weddingId: string; method: PaymentMethod } & FeeConfig)[]) {
  return {
    list: jest.fn(async (weddingId: string) =>
      rows
        .filter((row) => row.weddingId === weddingId)
        .map(({ method, percentBps, fixedCents }) => ({ method, percentBps, fixedCents })),
    ),
    saveAll: jest.fn(async (weddingId: string, fees: Record<'PIX' | 'CARD', FeeConfig>) => {
      for (const method of ['PIX', 'CARD'] as const) {
        const row = rows.find((fee) => fee.weddingId === weddingId && fee.method === method);
        if (row) Object.assign(row, fees[method]);
        else rows.push({ weddingId, method, ...fees[method] });
      }
    }),
  };
}

function fakeEvents(
  rows: { id: string; weddingId: string; requestId: string; processedAt: Date | null }[],
) {
  return {
    register: jest.fn(async (weddingId: string, event: { requestId: string }) => {
      let row = rows.find((e) => e.requestId === event.requestId);
      if (!row) {
        row = { id: randomUUID(), weddingId, requestId: event.requestId, processedAt: null };
        rows.push(row);
      }
      return { id: row.id, processedAt: row.processedAt };
    }),
    markProcessed: jest.fn(async (weddingId: string, eventId: string, now: Date) => {
      const row = rows.find((e) => e.id === eventId && e.weddingId === weddingId);
      if (row) row.processedAt = now;
    }),
  };
}

export function paymentsHarness(start = new Date('2027-01-10T12:00:00.000Z')) {
  let now = start;
  const clock = { now: () => now } as Clock;
  const encryptionKey = randomBytes(32).toString('base64');
  const config = { get: () => encryptionKey } as unknown as ConfigService<Env, true>;
  const crypto = new CryptoService(config);
  const provider = new FakePaymentProvider();
  const logger = fakeLogger();
  const db = {
    gifts: [] as GiftRow[],
    orders: [] as OrderRow[],
    accounts: [] as AccountRow[],
    fees: [] as ({ weddingId: string; method: PaymentMethod } & FeeConfig)[],
    events: [] as { id: string; weddingId: string; requestId: string; processedAt: Date | null }[],
    pixKeys: [] as ({ weddingId: string } & PixKeyRecord)[],
  };
  const gifts = fakeGifts(db.gifts);
  const ordersRepo = fakeOrders(db.orders, clock);
  const accountsRepo = fakeAccounts(db.accounts);
  const feesRepo = fakeFees(db.fees);
  const eventsRepo = fakeEvents(db.events);
  const audit = { record: jest.fn(async () => undefined) };
  const members = { findRole: jest.fn(async () => 'owner') };
  const transactions = {
    run: <T>(fn: (tx: Tx) => Promise<T>) => fn({} as Tx),
  } as TransactionRunner;

  const accounts = new PaymentAccountsService(
    accountsRepo as unknown as PaymentAccountsRepository,
    provider,
    crypto,
    audit as unknown as AuditService,
    members as unknown as MembersService,
    clock,
    logger,
  );
  const fees = new PaymentFeesService(
    feesRepo as unknown as PaymentFeesRepository,
    audit as unknown as AuditService,
  );
  const transitions = new OrderTransitionsService(
    ordersRepo as unknown as OrdersRepository,
    gifts as unknown as GiftsService,
    transactions,
    clock,
    logger,
  );
  const sync = new OrderSyncService(
    ordersRepo as unknown as OrdersRepository,
    accounts,
    provider,
    transitions,
    clock,
    logger,
  );
  const weddings = {
    getDetails: jest.fn(async (weddingId: string) => ({
      coupleName: weddingId === WEDDING_A ? 'Ana & Bia' : 'Caio & Davi',
      weddingDate: new Date('2027-07-23T19:00:00.000Z'),
    })),
  };
  const pixKeys = new PixKeysService(
    fakePixKeys(db.pixKeys) as unknown as PixKeysRepository,
    weddings as unknown as WeddingsService,
    audit as unknown as AuditService,
  );
  const checkout = new CheckoutService(
    accounts,
    fees,
    pixKeys,
    gifts as unknown as GiftsService,
    ordersRepo as unknown as OrdersRepository,
    transitions,
    transactions,
    crypto,
    provider,
    clock,
    logger,
  );
  const webhooks = new MercadoPagoWebhookService(
    provider,
    ordersRepo as unknown as OrdersRepository,
    eventsRepo as unknown as WebhookEventsRepository,
    sync,
    accounts,
    clock,
    logger,
  );
  const received = new ReceivedGiftsService(
    ordersRepo as unknown as OrdersRepository,
    gifts as unknown as GiftsService,
  );
  const directPix = new DirectPixReviewService(
    ordersRepo as unknown as OrdersRepository,
    transitions,
    audit as unknown as AuditService,
  );

  /** Chave Pix do casal já gravada, para o Pix direto (spec 017). */
  const setPixKey = (
    weddingId = WEDDING_A,
    keyType: PixKeyType = 'EMAIL',
    key = 'casal@example.com',
  ) => db.pixKeys.push({ weddingId, keyType, key });

  /** Conta conectada e válida, com tokens cifrados como no banco. */
  const connect = (weddingId = WEDDING_A, overrides: Partial<AccountRow> = {}) => {
    const row: AccountRow = {
      weddingId,
      providerUserId: weddingId === WEDDING_A ? 'mp-user-a' : 'mp-user-b',
      publicKey: `APP_USR-public-${weddingId === WEDDING_A ? 'a' : 'b'}`,
      accessTokenEnc: crypto.encrypt(`APP_USR-access-${weddingId}`),
      refreshTokenEnc: crypto.encrypt(`TG-refresh-${weddingId}`),
      expiresAt: new Date(now.getTime() + 150 * 24 * 3600_000),
      status: 'CONNECTED',
      disconnectReason: null,
      connectedAt: now,
      disconnectedAt: null,
      ...overrides,
    };
    db.accounts.push(row);
    return row;
  };

  const addGift = (overrides: Partial<GiftRow> = {}) => {
    const gift = quotaGift(overrides);
    db.gifts.push(gift);
    return gift;
  };

  const orderInput = (giftId: string, overrides: Record<string, unknown> = {}) => ({
    giftId,
    method: 'PIX' as 'PIX' | 'CARD',
    quantity: 1,
    payer: { name: 'Carla Dias', email: 'carla@example.com', cpf: '52998224725' },
    message: 'Felicidades!',
    isAnonymous: false,
    ...overrides,
  });

  return {
    db,
    provider,
    crypto,
    logger,
    audit,
    members,
    gifts,
    ordersRepo,
    accountsRepo,
    eventsRepo,
    accounts,
    fees,
    transitions,
    sync,
    checkout,
    webhooks,
    received,
    pixKeys,
    directPix,
    setPixKey,
    connect,
    addGift,
    orderInput,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    now: () => now,
  };
}
