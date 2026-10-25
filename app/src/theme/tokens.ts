// Design tokens from the Repplay brand kit (docs/brand/repplay): ground is Ink, text is Paper, accent is Lima. surface, border, muted and rec are the app interface colors of the kit. recordingGround, screenOff, soft and the warning pair are app-only. The UI is always dark.

export const colors = {
  ground: '#0B0B09',
  recordingGround: '#070806',
  /** Pure black for screen economy while recording: OLED pixels switch off. */
  screenOff: '#000000',
  surface: '#1B1D18',
  border: '#3A3D34',
  text: '#F3EDE1',
  muted: '#A9A79C',
  soft: '#CFCBBF',
  accent: '#D6F23F',
  onAccent: '#0B0B09',
  rec: '#FF5A36',
  warning: '#FF8A3D',
  warningGround: '#3A1D10',
} as const;

export const fonts = {
  display: 'BarlowCondensed_700Bold',
  displayBold: 'BarlowCondensed_800ExtraBold',
  body: 'Manrope_400Regular',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
} as const;

export const radius = { chip: 20, card: 14, button: 16, sheet: 24 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
