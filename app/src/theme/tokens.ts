// Design tokens from the Revi brand guide: ground is Ink, text is White, accent is Amber. surface, border, muted and rec are the app interface colors of the kit. recordingGround, screenOff, soft and the warning pair are app-only. The UI is always dark.

export const colors = {
  ground: '#0A0A0A',
  recordingGround: '#070707',
  /** Pure black for screen economy while recording: OLED pixels switch off. */
  screenOff: '#000000',
  surface: '#141414',
  border: '#2E2E2E',
  text: '#FFFFFF',
  muted: '#B3B3B3',
  soft: '#CCCCCC',
  accent: '#FFB000',
  onAccent: '#0A0A0A',
  rec: '#FF453A',
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
