import { Injectable } from '@nestjs/common';
import type { WeddingRole } from '../../generated/prisma/enums';
import { MemberInvitationsRepository } from './member-invitations.repository';
import { MemberLastOwner } from './errors/member-last-owner';
import { MemberNotFound } from './errors/member-not-found';
import { MembersRepository } from './members.repository';

@Injectable()
export class MembersService {
  constructor(
    private readonly repository: MembersRepository,
    private readonly invitations: MemberInvitationsRepository,
  ) {}

  findRole(weddingId: string, userId: string): Promise<WeddingRole | null> {
    return this.repository.findRole(weddingId, userId);
  }

  listByUser(userId: string) {
    return this.repository.listByUser(userId);
  }

  /** Acesso ao painel: membros e convites pendentes do casamento (spec 005 RF08). */
  async listAccess(weddingId: string) {
    const [members, invitations] = await Promise.all([
      this.repository.list(weddingId),
      this.invitations.list(weddingId),
    ]);
    return {
      members: members.map(({ id, role, user }) => ({
        id,
        role,
        name: user.name,
        email: user.email,
      })),
      invitations,
    };
  }

  /** Qualquer membro pode ser removido, inclusive outro owner, menos o último owner (RF09). */
  async remove(weddingId: string, memberId: string): Promise<void> {
    const result = await this.repository.removeMember(weddingId, memberId);
    if (result === 'not_found') throw new MemberNotFound();
    if (result === 'last_owner') throw new MemberLastOwner();
  }
}
