import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { newInvitationToken, pickFreeCode } from './credentials';
import { readTemplate } from './guest-template';
import { planImport, type RejectedRow } from './import-rows';
import { InvitationsRepository } from './invitations.repository';

export interface GuestImportResult {
  createdInvitations: number;
  createdGuests: number;
  rejected: RejectedRow[];
}

/**
 * Importação pela planilha modelo na própria requisição (spec 009 RF06, ADR-001): o arquivo fica
 * só em memória, os convites aceitos entram numa transação e as linhas recusadas voltam com o
 * motivo. O log leva só contagens, nunca nomes, contatos ou linhas (RNF03).
 */
@Injectable()
export class GuestImportService {
  constructor(
    private readonly repository: InvitationsRepository,
    @InjectPinoLogger(GuestImportService.name) private readonly logger: PinoLogger,
  ) {}

  async import(weddingId: string, file: Buffer): Promise<GuestImportResult> {
    const rows = await readTemplate(file);
    const plan = planImport(rows, await this.repository.listPeople(weddingId));

    if (plan.invitations.length > 0) {
      const taken = await this.repository.listCodes(weddingId);
      const invitations = plan.invitations.map((invitation) => {
        const code = pickFreeCode(taken);
        taken.add(code);
        return { ...invitation, token: newInvitationToken(), code };
      });
      await this.repository.createFromImport(weddingId, invitations);
    }

    const result = {
      createdInvitations: plan.invitations.length,
      createdGuests: plan.invitations.reduce(
        (sum, invitation) => sum + invitation.guests.length,
        0,
      ),
      rejected: plan.rejected,
    };
    this.logger.info(
      {
        createdInvitations: result.createdInvitations,
        createdGuests: result.createdGuests,
        rejectedRows: result.rejected.length,
      },
      'guest_import_done',
    );
    return result;
  }
}
