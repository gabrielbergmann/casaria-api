import type { GuestData } from './invitations.repository';

/** Pessoa nova vinda do DTO: contato ausente ou vazio é gravado como null. */
export const toGuestData = (input: {
  name: string;
  isChild: boolean;
  phone?: string | null;
  email?: string | null;
}): GuestData => ({
  name: input.name,
  isChild: input.isChild,
  phone: input.phone ?? null,
  email: input.email ?? null,
});
