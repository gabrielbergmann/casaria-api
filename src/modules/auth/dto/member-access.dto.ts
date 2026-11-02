import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PasswordSchema } from '../password';

const role = z.enum(['owner', 'editor']);

export const CreateMemberInvitationSchema = z.object({
  email: z.email({ error: 'Informe um email válido.' }),
  role,
});

export class CreateMemberInvitationDto extends createZodDto(CreateMemberInvitationSchema) {}

export const MemberInvitationSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role,
  expiresAt: z.iso.datetime(),
});

export const CreatedMemberInvitationSchema = MemberInvitationSchema.extend({ link: z.url() });

export class CreatedMemberInvitationDto extends createZodDto(CreatedMemberInvitationSchema) {}

export const MemberAccessSchema = z.object({
  members: z.array(z.object({ id: z.uuid(), name: z.string(), email: z.email(), role })),
  invitations: z.array(MemberInvitationSchema),
});

export class MemberAccessDto extends createZodDto(MemberAccessSchema) {}

export const InvitationTokenSchema = z.object({ token: z.string().min(1) });

export class InvitationTokenDto extends createZodDto(InvitationTokenSchema) {}

export const InvitationLookupSchema = z.object({
  coupleName: z.string(),
  role,
  email: z.email(),
  accountExists: z.boolean(),
});

export class InvitationLookupDto extends createZodDto(InvitationLookupSchema) {}

export const AcceptWithSignupSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1, { error: 'Informe seu nome.' }).max(120),
  password: PasswordSchema,
});

export class AcceptWithSignupDto extends createZodDto(AcceptWithSignupSchema) {}

export const AcceptedInvitationSchema = z.object({ weddingId: z.uuid() });

export class AcceptedInvitationDto extends createZodDto(AcceptedInvitationSchema) {}
