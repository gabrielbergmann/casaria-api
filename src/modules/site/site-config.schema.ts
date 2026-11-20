import { z } from 'zod';
import { FONT_FAMILIES } from './theme-options';

// Documento do site (spec 007, skill site-e-tema §1 e §2). O único limite de tamanho é o do
// documento inteiro (100 KB, no service). O texto do casal é puro ou, nos campos da spec 020,
// formatado numa lista fechada de blocos e formatos; nunca HTML.

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
/**
 * Ícone escolhido pelo casal (spec 019): nome do Lucide ou `none`, sem ícone; ausente usa o padrão.
 * Só o formato é conferido aqui: o site ignora um nome que não existe (ADR-002).
 */
const icon = z
  .string()
  .max(64, { error: 'Ícone inválido.' })
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'Ícone inválido.' })
  .optional();

// Texto formatado (spec 020): o JSON do Tiptap só com os blocos, formatos e atributos da lista.
// Qualquer coisa a mais é recusada (RF07); o texto puro de antes continua valendo (ADR-002).
const textAlign = z.enum(['left', 'center', 'right']);
const RichMark = z
  .discriminatedUnion('type', [
    z.strictObject({ type: z.literal('bold') }),
    z.strictObject({ type: z.literal('italic') }),
    z.strictObject({ type: z.literal('underline') }),
    z.strictObject({ type: z.literal('link'), attrs: z.strictObject({ href: httpUrl }) }),
  ])
  .meta({ id: 'RichTextMark' });
const RichInline = z
  .discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('text'),
      text: z.string().min(1),
      marks: z.array(RichMark).optional(),
    }),
    z.strictObject({ type: z.literal('hardBreak') }),
  ])
  .meta({ id: 'RichTextInline' });
const RichParagraph = z
  .strictObject({
    type: z.literal('paragraph'),
    attrs: z.strictObject({ textAlign: textAlign.optional() }).optional(),
    content: z.array(RichInline).optional(),
  })
  .meta({ id: 'RichTextParagraph' });
/** Título (3) e subtítulo (4), abaixo do título da seção, que é o 2. */
const RichHeading = z
  .strictObject({
    type: z.literal('heading'),
    attrs: z.strictObject({
      level: z.union([z.literal(3), z.literal(4)]),
      textAlign: textAlign.optional(),
    }),
    content: z.array(RichInline).optional(),
  })
  .meta({ id: 'RichTextHeading' });

/** Listas com marcadores e numeradas, aninhadas até 3 níveis (RF07). */
const MAX_LIST_DEPTH = 3;
type ListSchemas = [z.ZodType, z.ZodType];
function listsAt(depth: number): ListSchemas {
  const inner =
    depth < MAX_LIST_DEPTH ? z.union([RichParagraph, ...listsAt(depth + 1)]) : RichParagraph;
  const item = z.strictObject({ type: z.literal('listItem'), content: z.array(inner).min(1) });
  return [
    z.strictObject({ type: z.literal('bulletList'), content: z.array(item).min(1) }),
    z.strictObject({ type: z.literal('orderedList'), content: z.array(item).min(1) }),
  ];
}

const RichDoc = z.strictObject({
  type: z.literal('doc'),
  content: z.array(z.union([RichParagraph, RichHeading, ...listsAt(1)])),
});

/** Texto puro, como antes, ou formatado (spec 020 RF01). */
const richText = z
  .union([z.string(), RichDoc], { error: 'Texto formatado inválido.' })
  .meta({ id: 'RichText' });

/** Item de hospedagem e de dicas (spec 019). */
const linkItems = z.object({
  items: z.array(
    z.object({ title: text, description: richText.optional(), url: optionalUrl, icon }),
  ),
});

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
    notes: richText.optional(),
    /** Ícones do dia, da hora e do endereço deste evento (spec 019). */
    icons: z.object({ day: icon, time: icon, address: icon }).optional(),
  })
  .meta({ id: 'SiteEvent' });

const section = <T extends string, C extends z.ZodObject>(type: T, content: C) =>
  z.object({ type: z.literal(type), enabled: z.boolean(), icon, content });

export const SectionSchema = z
  .discriminatedUnion('type', [
    section('hero', z.object({})),
    section('story', z.object({ text: richText, mediaIds: z.array(mediaId) })),
    section(
      'ceremony',
      z.object({
        ceremony: EventSchema.nullable(),
        party: EventSchema.nullable(),
        /** Festa no mesmo local da cerimônia: o site mostra um cartão só, com os dois horários. */
        sameVenue: z.boolean().optional(),
      }),
    ),
    section(
      'dressCode',
      /** Fotos de inspiração do traje; opcional porque os documentos antigos não têm. */
      z.object({ text: richText, mediaIds: z.array(mediaId).optional() }),
    ),
    section(
      'weddingParty',
      z.object({
        people: z.array(
          z.object({ name: text, role: text.optional(), mediaId: mediaId.optional() }),
        ),
      }),
    ),
    section('lodging', linkItems),
    section('tips', linkItems),
    section('gallery', z.object({ mediaIds: z.array(mediaId) })),
    section(
      'faq',
      z.object({ items: z.array(z.object({ question: text, answer: richText, icon })) }),
    ),
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
    section('thanks', z.object({ heading: text, text: richText })),
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
  'tips',
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
export const SITE_CONFIG_VERSION = 3;

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
