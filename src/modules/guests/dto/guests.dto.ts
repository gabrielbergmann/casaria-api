import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  EmailField,
  MaxCompanionsField,
  NAME_TOO_LONG_ERROR,
  NameField,
  PhoneField,
} from '../guest-fields';

const LabelField = z
  .string()
  .trim()
  .min(1, { error: 'Informe o nome do convite.' })
  .max(120, { error: NAME_TOO_LONG_ERROR });

const GuestInputSchema = z.object({
  name: NameField,
  isChild: z.boolean().default(false),
  phone: PhoneField,
  email: EmailField,
});

export const CreateGuestSchema = GuestInputSchema;

export class CreateGuestDto extends createZodDto(CreateGuestSchema) {}

export const UpdateGuestSchema = z.object({
  name: NameField.optional(),
  isChild: z.boolean().optional(),
  phone: PhoneField,
  email: EmailField,
});

export class UpdateGuestDto extends createZodDto(UpdateGuestSchema) {}

export const CreateInvitationSchema = z.object({
  label: LabelField,
  maxCompanions: MaxCompanionsField.default(0),
  guests: z
    .array(GuestInputSchema)
    .min(1, { error: 'Inclua pelo menos uma pessoa no convite.' })
    .max(100, { error: 'Use até 100 pessoas por convite.' }),
});

export class CreateInvitationDto extends createZodDto(CreateInvitationSchema) {}

export const UpdateInvitationSchema = z.object({
  label: LabelField.optional(),
  maxCompanions: MaxCompanionsField.optional(),
});

export class UpdateInvitationDto extends createZodDto(UpdateInvitationSchema) {}

export const ListInvitationsQuerySchema = z.object({
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export class ListInvitationsQueryDto extends createZodDto(ListInvitationsQuerySchema) {}

export const GuestSchema = z.object({
  id: z.uuid(),
  invitationId: z.uuid(),
  name: z.string(),
  isChild: z.boolean(),
  // Com formato: z.string().nullable() vira type ["string","null"], que o OpenAPI 3.0 recusa.
  phone: z.e164().nullable(),
  email: z.email().nullable(),
  /** LIST = da lista do casal; COMPANION = acompanhante incluído pelo convidado (010). */
  origin: z.enum(['LIST', 'COMPANION']),
});

export class GuestDto extends createZodDto(GuestSchema) {}

export const InvitationSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  maxCompanions: z.int(),
  code: z.string(),
  /** https://<slug>.<dominio>/#convite=<token> */
  inviteUrl: z.url(),
  guests: z.array(GuestSchema),
});

export class InvitationDto extends createZodDto(InvitationSchema) {}

export const InvitationPageSchema = z.object({
  items: z.array(InvitationSchema),
  page: z.int(),
  pageSize: z.int(),
  total: z.int(),
});

export class InvitationPageDto extends createZodDto(InvitationPageSchema) {}

export const InvitationCredentialsSchema = z.object({ code: z.string(), inviteUrl: z.url() });

export class InvitationCredentialsDto extends createZodDto(InvitationCredentialsSchema) {}

export const GuestSettingsSchema = z.object({
  inviteMessage: z
    .string()
    .trim()
    .min(1, { error: 'Escreva o texto do convite.' })
    .max(1000, { error: 'Use até 1.000 caracteres.' }),
});

export class GuestSettingsDto extends createZodDto(GuestSettingsSchema) {}

export const GuestImportResultSchema = z.object({
  createdInvitations: z.int(),
  createdGuests: z.int(),
  rejected: z.array(z.object({ row: z.int(), name: z.string(), reason: z.string() })),
});

export class GuestImportResultDto extends createZodDto(GuestImportResultSchema) {}
