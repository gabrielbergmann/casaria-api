import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../infra/prisma/transaction-runner';
import { MemberInvitationsService } from '../auth/member-invitations.service';
import { WeddingsService } from '../weddings/weddings.service';

export interface CreateWeddingInput {
  coupleName: string;
  weddingDate: Date;
  slug: string;
  ownerEmail: string;
}

// Só orquestra: casamento (weddings) e convite do primeiro owner (auth) na mesma transação.
@Injectable()
export class AdminService {
  constructor(
    private readonly weddings: WeddingsService,
    private readonly invitations: MemberInvitationsService,
    private readonly transactions: TransactionRunner,
  ) {}

  createWedding({ ownerEmail, ...details }: CreateWeddingInput) {
    return this.transactions.run(async (tx) => {
      const weddingId = await this.weddings.create(details, tx);
      const invitation = await this.invitations.invite(weddingId, ownerEmail, 'owner', tx);
      return { weddingId, invitation };
    });
  }

  listWeddings() {
    return this.weddings.listAll();
  }
}
