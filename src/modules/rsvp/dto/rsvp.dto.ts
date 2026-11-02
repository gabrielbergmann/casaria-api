import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { EmailField, NameField, PhoneField } from '../../guests/guest-fields';

// Strings anuláveis de resposta levam um limite: z.string().nullable() sozinho vira
// type ["string","null"], que o OpenAPI 3.0 do orval recusa.

const status = z.enum(['CONFIRMED', 'DECLINED']);

/** Vazio vira null; ausente fica ausente. */
const MessageField = z
  .string()
  .trim()
  .max(1000, { error: 'Use até 1.000 caracteres.' })
  .transform((value) => value || null)
  .nullish();

/** Ausente mantém a gravada, null ou vazio apaga, texto substitui (ADR-002). */
const DietaryNotesField = z
  .string()
  .trim()
  .max(500, { error: 'Use até 500 caracteres.' })
  .transform((value) => value || null)
  .nullish();

// --- Rotas públicas do site -------------------------------------------------------------

export const IdentifyInvitationSchema = z
  .object({
    token: z.string().min(1).max(64).optional(),
    code: z.string().min(1).max(32).optional(),
  })
  .refine((input) => (input.token === undefined) !== (input.code === undefined), {
    error: 'Envie o token do link ou o código do convite.',
  });

export class IdentifyInvitationDto extends createZodDto(IdentifyInvitationSchema) {}

export const AnswerInvitationSchema = z.object({
  token: z.string().min(1).max(64),
  answers: z
    .array(
      z.object({
        guestId: z.uuid(),
        status,
        dietaryNotes: DietaryNotesField,
        message: MessageField,
      }),
    )
    .max(100),
  companions: z
    .array(
      z.object({
        /** Acompanhante já gravado; null cria um novo. */
        id: z.uuid().nullish(),
        name: NameField,
        isChild: z.boolean().default(false),
        dietaryNotes: DietaryNotesField,
        message: MessageField,
      }),
    )
    .max(999)
    .default([]),
});

export class AnswerInvitationDto extends createZodDto(AnswerInvitationSchema) {}

export const OpenAnswerSchema = z
  .object({
    name: NameField,
    phone: PhoneField,
    email: EmailField,
    status,
    message: MessageField,
  })
  .refine((input) => !!(input.phone || input.email), {
    path: ['phone'],
    error: 'Informe um telefone ou um email.',
  });

export class OpenAnswerDto extends createZodDto(OpenAnswerSchema) {}

export const PublicRsvpStatusSchema = z.object({
  openModeEnabled: z.boolean(),
  deadline: z.iso.datetime().nullable(),
  deadlinePassed: z.boolean(),
});

export class PublicRsvpStatusDto extends createZodDto(PublicRsvpStatusSchema) {}

export const InvitationRsvpSchema = z.object({
  /** Mandado de volta no envio, também quando o convite veio pelo código. */
  token: z.string(),
  label: z.string(),
  maxCompanions: z.int(),
  deadline: z.iso.datetime().nullable(),
  guests: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      isChild: z.boolean(),
      origin: z.enum(['LIST', 'COMPANION']),
      status: status.nullable(),
      /** A restrição nunca sai na rota pública (ADR-002). */
      hasDietaryNotes: z.boolean(),
      message: z.string().max(1000).nullable(),
    }),
  ),
});

export class InvitationRsvpDto extends createZodDto(InvitationRsvpSchema) {}

// --- Painel --------------------------------------------------------------------------------

export const SaveRsvpSettingsSchema = z.object({
  openModeEnabled: z.boolean(),
  deadline: z.iso.datetime({ offset: true, error: 'Informe a data e a hora.' }).nullable(),
});

export class SaveRsvpSettingsDto extends createZodDto(SaveRsvpSettingsSchema) {}

export const RsvpSettingsSchema = z.object({
  openModeEnabled: z.boolean(),
  deadline: z.iso.datetime().nullable(),
});

export class RsvpSettingsDto extends createZodDto(RsvpSettingsSchema) {}

const totals = z.object({ confirmed: z.int(), pending: z.int(), declined: z.int() });

export const RsvpSummarySchema = z.object({
  adults: totals,
  children: totals,
  visitors: z.object({ confirmed: z.int(), declined: z.int() }),
});

export class RsvpSummaryDto extends createZodDto(RsvpSummarySchema) {}

const personStatus = z.enum(['CONFIRMED', 'DECLINED', 'PENDING']);

export const ListPeopleQuerySchema = z.object({
  status: personStatus.optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export class ListPeopleQueryDto extends createZodDto(ListPeopleQuerySchema) {}

export const RsvpPeoplePageSchema = z.object({
  items: z.array(
    z.object({
      guestId: z.uuid(),
      invitationLabel: z.string(),
      name: z.string(),
      isChild: z.boolean(),
      origin: z.enum(['LIST', 'COMPANION']),
      status: personStatus,
      /** Só no painel, para owner e editor (RF13). */
      dietaryNotes: z.string().max(500).nullable(),
      message: z.string().max(1000).nullable(),
      respondedAt: z.iso.datetime().nullable(),
    }),
  ),
  page: z.int(),
  pageSize: z.int(),
  total: z.int(),
});

export class RsvpPeoplePageDto extends createZodDto(RsvpPeoplePageSchema) {}

export const PageQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1) });

export class PageQueryDto extends createZodDto(PageQuerySchema) {}

export const OpenResponsesPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      phone: z.e164().nullable(),
      email: z.email().nullable(),
      status,
      message: z.string().max(1000).nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
  page: z.int(),
  pageSize: z.int(),
  total: z.int(),
});

export class OpenResponsesPageDto extends createZodDto(OpenResponsesPageSchema) {}

export const ExportQuerySchema = z.object({ format: z.enum(['xlsx', 'csv']).default('xlsx') });

export class ExportQueryDto extends createZodDto(ExportQuerySchema) {}
