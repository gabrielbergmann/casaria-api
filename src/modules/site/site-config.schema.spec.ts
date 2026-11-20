import { initialSiteConfig } from './initial-site-config';
import {
  PublicSiteConfigSchema,
  SECTION_TYPES,
  SiteConfigSchema,
  type SiteConfig,
} from './site-config.schema';
import { FONT_FAMILIES, PALETTES } from './theme-options';

const issuesOf = (config: unknown) => {
  const result = SiteConfigSchema.safeParse(config);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

const withSection = (config: SiteConfig, type: string, content: unknown) => ({
  ...config,
  sections: config.sections.map((section) =>
    section.type === type ? { ...section, content } : section,
  ),
});

// Luminância relativa e razão de contraste da WCAG 2.
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

describe('initialSiteConfig', () => {
  it('has the PRD sections enabled in order, the first palette, Playfair Display and Lato', () => {
    const config = initialSiteConfig();

    expect(config.sections.map((section) => section.type)).toEqual([...SECTION_TYPES]);
    // Álbum e agradecimento (spec 014) nascem desativados no fim.
    const enabled = config.sections.filter((section) => section.enabled).map((s) => s.type);
    expect(enabled).toEqual(SECTION_TYPES.slice(0, -2));
    expect(config.theme).toEqual({
      colors: PALETTES[0].colors,
      fonts: { heading: 'Playfair Display', body: 'Lato' },
      coverMediaId: null,
    });
    expect(SiteConfigSchema.safeParse(config).success).toBe(true);
  });

  it('returns a fresh copy every time', () => {
    const first = initialSiteConfig();
    first.theme.colors.text = '#000000';

    expect(initialSiteConfig().theme.colors.text).toBe(PALETTES[0].colors.text);
  });
});

describe('theme options', () => {
  it('offers the ten curated fonts and 4 to 6 palettes', () => {
    expect(FONT_FAMILIES).toHaveLength(10);
    expect(PALETTES.length).toBeGreaterThanOrEqual(4);
    expect(PALETTES.length).toBeLessThanOrEqual(6);
  });

  it.each(PALETTES.map((palette) => [palette.name, palette]))(
    'keeps text over background, surface and primary at WCAG AA in %s',
    (_name, palette) => {
      expect(contrast(palette.colors.text, palette.colors.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.colors.text, palette.colors.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.colors.text, palette.colors.primary)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(PALETTES.map((palette) => [palette.name, palette]))(
    'keeps the accent labels over background and surface at WCAG AA in %s',
    (_name, palette) => {
      expect(contrast(palette.colors.accent, palette.colors.background)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(palette.colors.accent, palette.colors.surface)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('SiteConfigSchema', () => {
  const base = initialSiteConfig();

  it('rejects a font outside the list', () => {
    const config = {
      ...base,
      theme: { ...base.theme, fonts: { heading: 'Comic Sans', body: 'Lato' } },
    };

    expect(issuesOf(config)).toEqual(['theme.fonts.heading']);
  });

  it('rejects a short #FFF color', () => {
    const config = {
      ...base,
      theme: { ...base.theme, colors: { ...base.theme.colors, text: '#FFF' } },
    };

    expect(issuesOf(config)).toEqual(['theme.colors.text']);
  });

  it('rejects a repeated section, pointing at the duplicate', () => {
    const faq = base.sections.find((section) => section.type === 'faq');
    const config = { ...base, sections: [...base.sections, faq] };

    expect(issuesOf(config)).toEqual([`sections.${base.sections.length}.type`]);
  });

  it('rejects a document without one of the sections', () => {
    const config = {
      ...base,
      sections: base.sections.filter((section) => section.type !== 'rsvp'),
    };

    expect(issuesOf(config)).toEqual(['sections']);
  });

  it('lets the public version omit only the post-wedding sections', () => {
    const before = (type: string) => ({
      ...base,
      sections: base.sections.filter(
        (section) => !['album', 'thanks', type].includes(section.type),
      ),
    });

    expect(PublicSiteConfigSchema.safeParse(before('none')).success).toBe(true);
    expect(SiteConfigSchema.safeParse(before('none')).success).toBe(false);
    expect(PublicSiteConfigSchema.safeParse(before('rsvp')).success).toBe(false);
  });

  it('rejects javascript: links and accepts http(s) or empty ones', () => {
    const lodging = (url: string) =>
      withSection(base, 'lodging', { items: [{ title: 'Hotel', url }] });
    const music = withSection(base, 'music', { songs: [], playlistUrl: 'javascript:alert(1)' });

    expect(issuesOf(lodging('javascript:alert(1)'))).toEqual(['sections.5.content.items.0.url']);
    expect(issuesOf(music)).toEqual(['sections.9.content.playlistUrl']);
    expect(issuesOf(lodging('https://hotel.example.com'))).toEqual([]);
    expect(issuesOf(lodging(''))).toEqual([]);
  });

  it('accepts ceremony and party with UTC dates and rejects a date without time zone', () => {
    const event = {
      venueName: 'Igreja',
      address: 'Rua A, 1',
      startsAt: '2027-05-15T19:00:00.000Z',
    };

    expect(issuesOf(withSection(base, 'ceremony', { ceremony: event, party: null }))).toEqual([]);
    expect(
      issuesOf(
        withSection(base, 'ceremony', {
          ceremony: { ...event, startsAt: '2027-05-15T19:00' },
          party: null,
        }),
      ),
    ).toEqual(['sections.2.content.ceremony.startsAt']);
  });

  it('accepts the party at the ceremony venue, with only time and notes', () => {
    const ceremony = { venueName: 'Sítio', address: 'Estrada B, 2' };
    const party = { venueName: '', address: '', startsAt: '2027-05-15T21:00:00.000Z' };

    expect(issuesOf(withSection(base, 'ceremony', { ceremony, party, sameVenue: true }))).toEqual(
      [],
    );
    expect(issuesOf(withSection(base, 'ceremony', { ceremony, party, sameVenue: 'sim' }))).toEqual([
      'sections.2.content.sameVenue',
    ]);
  });

  it('accepts dress code photos and the old dress code without them', () => {
    const photo = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

    expect(issuesOf(withSection(base, 'dressCode', { text: 'Esporte fino' }))).toEqual([]);
    expect(
      issuesOf(withSection(base, 'dressCode', { text: 'Esporte fino', mediaIds: [photo] })),
    ).toEqual([]);
    expect(issuesOf(withSection(base, 'dressCode', { text: '', mediaIds: ['x.jpg'] }))).toEqual([
      'sections.3.content.mediaIds.0',
    ]);
  });

  it('accepts icons on sections, items and event details, and none to hide (spec 019)', () => {
    const withIcons = {
      ...withSection(base, 'lodging', {
        items: [{ title: 'Hotel', icon: 'bed-double' }],
      }),
    };
    withIcons.sections = withIcons.sections.map((section) =>
      section.type === 'tips'
        ? { ...section, icon: 'none', content: { items: [{ title: 'Clima', icon: 'sun' }] } }
        : section.type === 'faq'
          ? { ...section, content: { items: [{ question: 'Pode?', answer: 'Sim', icon: 'x' }] } }
          : section,
    );
    const ceremony = {
      venueName: 'Igreja',
      address: 'Rua A',
      icons: { day: 'calendar-heart', time: 'clock-4', address: 'map-pinned' },
    };

    expect(issuesOf(withIcons)).toEqual([]);
    expect(issuesOf(withSection(base, 'ceremony', { ceremony, party: null }))).toEqual([]);
  });

  it('rejects an icon name outside the format, pointing at the field (spec 019 RF08)', () => {
    const config = withSection(base, 'lodging', { items: [{ title: 'Hotel', icon: '../x' }] });
    config.sections = config.sections.map((section) =>
      section.type === 'story' ? { ...section, icon: 'Heart' } : section,
    );
    const ceremony = { venueName: 'Igreja', address: 'Rua A', icons: { day: 'a'.repeat(65) } };

    expect(issuesOf(config)).toEqual(['sections.1.icon', 'sections.5.content.items.0.icon']);
    expect(issuesOf(withSection(base, 'ceremony', { ceremony, party: null }))).toEqual([
      'sections.2.content.ceremony.icons.day',
    ]);
  });

  it('rejects an image id that is not a uuid', () => {
    expect(issuesOf(withSection(base, 'gallery', { mediaIds: ['../x.jpg'] }))).toEqual([
      'sections.7.content.mediaIds.0',
    ]);
  });
});
