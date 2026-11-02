import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CreatedMemberInvitationSchema } from '../../auth/dto/member-access.dto';
import { CreateWeddingFields } from '../../weddings/dto/wedding.dto';

export const CreateWeddingSchema = z.object({
  ...CreateWeddingFields,
  ownerEmail: z.email({ error: 'Informe o email do casal.' }),
});

export class CreateWeddingDto extends createZodDto(CreateWeddingSchema) {}

export const CreatedWeddingSchema = z.object({
  weddingId: z.uuid(),
  invitation: CreatedMemberInvitationSchema.omit({ id: true }),
});

export class CreatedWeddingDto extends createZodDto(CreatedWeddingSchema) {}

export const AdminWeddingSchema = z.object({
  id: z.uuid(),
  coupleName: z.string(),
  slug: z.string(),
  weddingDate: z.iso.datetime(),
});

export class AdminWeddingDto extends createZodDto(AdminWeddingSchema) {}
