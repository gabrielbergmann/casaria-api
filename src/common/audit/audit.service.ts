import { Injectable } from '@nestjs/common';
import { AuditRepository } from './audit.repository';

/** Ações auditadas (PRD RF40); nada além disso entra na auditoria. */
export type AuditAction =
  | 'payments.account_connected'
  | 'payments.account_disconnected'
  | 'payments.fees_changed'
  | 'payments.pix_key_changed'
  | 'payments.pix_key_removed'
  | 'payments.direct_pix_confirmed'
  | 'payments.direct_pix_not_received'
  | 'superadmin.request';

export interface AuditEntry {
  action: AuditAction;
  /** Nulo quando a ação é do sistema (ex.: desconexão por falha de renovação). */
  actorUserId: string | null;
  weddingId: string | null;
  /** Só ids e valores não pessoais; nunca o corpo da requisição. */
  metadata: Record<string, string | number | boolean | null>;
}

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  record(entry: AuditEntry): Promise<void> {
    return this.repository.create(entry);
  }
}
