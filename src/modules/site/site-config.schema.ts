import { z } from 'zod';
import { FONT_FAMILIES } from './theme-options';

// Documento do site (spec 007, skill site-e-tema §1 e §2). O único limite de tamanho é o do
// documento inteiro (100 KB, no service); texto do casal é sempre texto puro.

/** Limite do PRD ("Restrições"), medido no JSON do documento. */
export const SITE_DOCUMENT_MAX_BYTES = 100 * 1024;

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: 'Use uma cor no formato #RRGGBB.' });
const font = z.enum(FONT_FAMILIES, { error: 'Escolha uma fonte da lista.' });
const mediaId = z.uuid({ error: 'Imagem inválida.' });
const text = z.string();
// Links só http(s); vazio conta como ausente.
const httpUrl = z.url({ protocol: /^https?$/, error: 'Use um link http:// ou https://.' });
const optionalUrl = z.union([z.literal(''), httpUrl]).optional();

export const ThemeSchema = z
  .object({
    colors: z.object({
      primary: hexColor,
      secondary: hexColor,
      background: hexColor,
      surface: hexColor,
      text: hexColor,
      accent: hexColor,
    }),
    fonts: z.object({ heading: font, body: font }),
    coverMediaId: mediaId.nullable(),
  })
  .meta({ id: 'SiteTheme' });

const EventSchema = z
  .object({
    venueName: text,
    address: text,
    startsAt: z.iso.datetime({ error: 'Informe a data e a hora.' }).optional(),
    notes: text.optional(),
  })
  .meta({ id: 'SiteEvent' });

const section = <T extends string, C extends z.ZodObject>(type: T, content: C) =>
  z.object({ type: z.literal(type), enabled: z.boolean(), content });

export const SectionSchema = z
  .discriminatedUnion('type', [
    section('hero', z.object({})),
    section('story', z.object({ text, mediaIds: z.array(mediaId) })),
    section(
      'ceremony',
      z.object({ ceremony: EventSchema.nullable(), party: EventSchema.nullable() }),
    ),
    section('dressCode', z.object({ text })),
    section(
      'weddingParty',
      z.object({
        people: z.array(
          z.object({ name: text, role: text.optional(), mediaId: mediaId.optional() }),
        ),
      }),
    ),
    section(
      'lodging',
      z.object({
        items: z.array(z.object({ title: text, description: text.optional(), url: optionalUrl })),
      }),
    ),
    section('gallery', z.object({ mediaIds: z.array(mediaId) })),
    section('faq', z.object({ items: z.array(z.object({ question: text, answer: text })) })),
    section(
      'music',
      z.object({
        songs: z.array(z.object({ title: text, artist: text.optional() })),
        playlistUrl: optionalUrl,
      }),
    ),
    // Encaixes: o conteúdo é estendido pelas specs donas (013, 011 e 010).
    section('guestbook', z.object({})),
    section('gifts', z.object({})),
    section('rsvp', z.object({})),
    // Pós-casamento (spec 014): só aparecem no site depois da data do casamento.
    section('album', z.object({ heading: text, mediaIds: z.array(mediaId) })),
    section('thanks', z.object({ heading: text, text })),
  ])
  .meta({ id: 'SiteSection' });

/** Ordem do PRD e do documento inicial. */
export const SECTION_TYPES = [
  'hero',
  'story',
  'ceremony',
  'dressCode',
  'weddingParty',
  'lodging',
  'gallery',
  'faq',
  'music',
  'guestbook',
  'gifts',
  'rsvp',
  'album',
  'thanks',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

/** Seções que o site público só recebe depois da data do casamento (spec 014 ADR-002). */
export const POST_WEDDING_SECTIONS: readonly SectionType[] = ['album', 'thanks'];

/** Sobe a cada mudança de formato; o service migra o documento antigo ao ler (skill site-e-tema §2). */
export const SITE_CONFIG_VERSION = 2;

// A ordem do array é a ordem no site; cada seção aparece no máximo uma vez, e só as de
// `optional` podem faltar.
const sectionsSchema = (optional: readonly SectionType[]) =>
  z.array(SectionSchema).superRefine((sections, ctx) => {
    const seen = new Set<string>();
    sections.forEach((item, index) => {
      if (seen.has(item.type)) {
        ctx.addIssue({ code: 'custom', path: [index, 'type'], message: 'Seção repetida.' });
      }
      seen.add(item.type);
    });
    const missing = SECTION_TYPES.filter((type) => !seen.has(type) && !optional.includes(type));
    if (missing.length > 0) {
      ctx.addIssue({ code: 'custom', message: `Faltam seções: ${missing.join(', ')}.` });
    }
  });

export const SiteConfigSchema = z.object({
  version: z.literal(SITE_CONFIG_VERSION),
  theme: ThemeSchema,
  sections: sectionsSchema([]),
});

/** Versão pública: antes da data, álbum e agradecimento saem da resposta (spec 014 ADR-002). */
export const PublicSiteConfigSchema = SiteConfigSchema.extend({
  sections: sectionsSchema(POST_WEDDING_SECTIONS),
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type SiteSection = z.infer<typeof SectionSchema>;
export type SiteTheme = z.infer<typeof ThemeSchema>;
