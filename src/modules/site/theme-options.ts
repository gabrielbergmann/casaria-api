// Fontes curadas e paletas prontas (spec 007 RF10), servidas por GET /v1/site/theme-options.

export const FONT_FAMILIES = [
  'Playfair Display',
  'Cormorant Garamond',
  'Libre Baskerville',
  'Great Vibes',
  'Lato',
  'Montserrat',
  'Open Sans',
  'Raleway',
] as const;

export type FontFamily = (typeof FONT_FAMILIES)[number];

export const DEFAULT_FONTS = { heading: 'Playfair Display', body: 'Lato' } as const;

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  accent: string;
}

export interface Palette {
  id: string;
  name: string;
  colors: ThemeColors;
}

// Direção "elegante clássico": fundos creme, filetes em areia e destaque dourado. O renderizador
// põe o texto sobre o fundo, a superfície e a cor primária (botões), e usa o destaque em rótulos
// pequenos sobre o fundo e a superfície: todos esses pares ficam acima de 4,5:1 (WCAG AA) em
// todas as paletas. A primeira entra no documento inicial.
export const PALETTES: Palette[] = [
  {
    id: 'classico',
    name: 'Clássico',
    colors: {
      primary: '#D9BC8C',
      secondary: '#D8C6A5',
      background: '#FBF8F3',
      surface: '#F4EDE2',
      text: '#2E261F',
      accent: '#7F612F',
    },
  },
  {
    id: 'jardim',
    name: 'Jardim',
    colors: {
      primary: '#C2CFB1',
      secondary: '#C9D2BA',
      background: '#F9F9F4',
      surface: '#EDF0E6',
      text: '#25301F',
      accent: '#55693E',
    },
  },
  {
    id: 'rose',
    name: 'Rosé',
    colors: {
      primary: '#E6C3BE',
      secondary: '#E3C9C3',
      background: '#FCF8F6',
      surface: '#F7EDEA',
      text: '#3A2629',
      accent: '#94525A',
    },
  },
  {
    id: 'mar',
    name: 'Mar',
    colors: {
      primary: '#C3D3DF',
      secondary: '#C9D5DE',
      background: '#F9FAF8',
      surface: '#ECF0F2',
      text: '#1D2A36',
      accent: '#3F5E78',
    },
  },
  {
    id: 'noite',
    name: 'Noite',
    colors: {
      primary: '#6B5630',
      secondary: '#5C5240',
      background: '#1B1E28',
      surface: '#242836',
      text: '#F3EDE2',
      accent: '#D2B06A',
    },
  },
];
