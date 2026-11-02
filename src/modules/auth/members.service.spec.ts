import type { MemberInvitationsRepository } from './member-invitations.repository';
import { MemberLastOwner } from './errors/member-last-owner';
import { MemberNotFound } from './errors/member-not-found';
import type { MembersRepository } from './members.repository';
import { MembersService } from './members.service';

describe('MembersService', () => {
  const repository = { removeMember: jest.fn(), list: jest.fn() };
  const invitations = { list: jest.fn() };
  const service = new MembersService(
    repository as unknown as MembersRepository,
    invitations as unknown as MemberInvitationsRepository,
  );

  beforeEach(() => jest.resetAllMocks());

  it('lists members and pending invitations of the wedding', async () => {
    repository.list.mockResolvedValue([
      { id: 'm-1', role: 'owner', user: { name: 'Ana', email: 'ana@example.com' } },
    ]);
    invitations.list.mockResolvedValue([
      { id: 'inv-1', email: 'bia@example.com', role: 'editor', expiresAt: new Date() },
    ]);

    const access = await service.listAccess('wedding-a');

    expect(access.members).toEqual([
      { id: 'm-1', role: 'owner', name: 'Ana', email: 'ana@example.com' },
    ]);
    expect(access.invitations).toHaveLength(1);
    expect(repository.list).toHaveBeenCalledWith('wedding-a');
    expect(invitations.list).toHaveBeenCalledWith('wedding-a');
  });

  it('answers 409 member.last_owner when removing the only owner', async () => {
    repository.removeMember.mockResolvedValue('last_owner');

    await expect(service.remove('wedding-a', 'm-1')).rejects.toBeInstanceOf(MemberLastOwner);
  });

  it('answers 404 for a member of another wedding', async () => {
    repository.removeMember.mockResolvedValue('not_found');

    await expect(service.remove('wedding-a', 'm-of-b')).rejects.toBeInstanceOf(MemberNotFound);
  });

  it('removes one of two owners', async () => {
    repository.removeMember.mockResolvedValue('removed');

    await expect(service.remove('wedding-a', 'm-2')).resolves.toBeUndefined();
  });
});
