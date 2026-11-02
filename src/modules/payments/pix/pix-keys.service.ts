import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service';
import type { PixKeyType } from '../../../generated/prisma/enums';
import { WeddingsService } from '../../weddings/weddings.service';
import { PaymentInvalidPixKey } from '../errors/payment-errors';
import { buildDirectPixCode } from './br-code';
import { normalizePixKey } from './pix-key';
import { type PixKeyRecord, PixKeysRepository } from './pix-keys.repository';

/**
 * Chave Pix do casal (spec 017 RF01 a RF04): só o owner grava, com auditoria sem a chave; com
 * ela, o Pix do checkout vira copia e cola direto na chave.
 */
@Injectable()
export class PixKeysService {
  constructor(
    private readonly repository: PixKeysRepository,
    private readonly weddings: WeddingsService,
    private readonly audit: AuditService,
  ) {}

  get(weddingId: string): Promise<PixKeyRecord | null> {
    return this.repository.find(weddingId);
  }

  async hasKey(weddingId: string): Promise<boolean> {
    return (await this.repository.find(weddingId)) !== null;
  }

  async save(
    weddingId: string,
    keyType: PixKeyType,
    rawKey: string,
    actorUserId: string,
  ): Promise<PixKeyRecord> {
    const key = normalizePixKey(keyType, rawKey);
    if (!key) throw new PaymentInvalidPixKey();
    await this.repository.save(weddingId, { keyType, key });
    await this.audit.record({
      action: 'payments.pix_key_changed',
      actorUserId,
      weddingId,
      metadata: { keyType },
    });
    return { keyType, key };
  }

  async remove(weddingId: string, actorUserId: string): Promise<void> {
    if (!(await this.repository.remove(weddingId))) return;
    await this.audit.record({
      action: 'payments.pix_key_removed',
      actorUserId,
      weddingId,
      metadata: {},
    });
  }

  /** Copia e cola do pedido na chave do casal, com o nome do casal (RF06). */
  async buildCode(weddingId: string, orderId: string, amountCents: number): Promise<string> {
    const [pixKey, details] = await Promise.all([
      this.repository.find(weddingId),
      this.weddings.getDetails(weddingId),
    ]);
    if (!pixKey) throw new Error('pix_key_missing');
    return buildDirectPixCode({
      key: pixKey.key,
      amountCents,
      merchantName: details.coupleName,
      txid: orderId,
    });
  }
}
