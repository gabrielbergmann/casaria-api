import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Mural de recados (spec 013). Nome e texto são texto puro: o front nunca os trata como HTML.

export const GUESTBOOK_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'] as const;
/** Destinos da moderação: nada volta a PENDING (ADR-001). */
export const MODERATION_STATUSES = ['APPROVED', 'REJECTED', 'HIDDEN'] as const;

export const GuestbookInputSchema = z.object({
  authorName: z
    .string()
    .trim()
    .min(1, { error: 'Informe seu nome.' })
    .max(120, { error: 'Use até 120 caracteres.' }),
  body: z
    .string()
    .trim()
    .min(1, { error: 'Escreva o recado.' })
    .max(1000, { error: 'Use até 1.000 caracteres.' }),
});

export class GuestbookInputDto extends createZodDto(GuestbookInputSchema) {}

export class GuestbookCreatedDto extends createZodDto(
  z.object({ id: z.uuid(), status: z.enum(['PENDING']) }),
) {}

const PublicMessageSchema = z.object({
  id: z.uuid(),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});

export class PublicGuestbookPageDto extends createZodDto(
  z.object({ items: z.array(PublicMessageSchema), nextCursor: z.uuid().nullable() }),
) {}

export class PublicGuestbookQueryDto extends createZodDto(
  z.object({ cursor: z.uuid().optional() }),
) {}

const PanelMessageSchema = PublicMessageSchema.extend({
  status: z.enum(GUESTBOOK_STATUSES),
  updatedAt: z.iso.datetime(),
});

export class GuestbookMessageDto extends createZodDto(PanelMessageSchema) {}

export class GuestbookPageDto extends createZodDto(
  z.object({
    items: z.array(PanelMessageSchema),
    nextCursor: z.uuid().nullable(),
    pendingCount: z.int(),
  }),
) {}

export class GuestbookQueryDto extends createZodDto(
  z.object({
    status: z.enum(GUESTBOOK_STATUSES).default('PENDING'),
    cursor: z.uuid().optional(),
  }),
) {}

export class ModerateGuestbookMessageDto extends createZodDto(
  z.object({ status: z.enum(MODERATION_STATUSES) }),
) {}
