import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '../theme/tokens';

type IconProps = { color?: string; size?: number };

const stroke = (color: string) => ({
  stroke: color,
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

export function PhoneIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Rect x={7} y={2} width={10} height={20} rx={2} {...stroke(color)} />
      <Path d="M4 8v8M20 8v8" {...stroke(color)} />
    </Svg>
  );
}

/** A QR code: three finder squares and a few modules. It stands for connecting by scanning the pairing code. */
export function QrIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Rect x={3} y={3} width={7} height={7} rx={1.5} {...stroke(color)} />
      <Rect x={14} y={3} width={7} height={7} rx={1.5} {...stroke(color)} />
      <Rect x={3} y={14} width={7} height={7} rx={1.5} {...stroke(color)} />
      <Path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4" {...stroke(color)} />
    </Svg>
  );
}

/** A player with both arms up, with small motion arcs beside the hands: raise them or wave them to save. */
export function ArmsUpIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Circle cx={12} cy={8} r={2} {...stroke(color)} />
      <Path d="M8 2v9l4 1 4-1V2M12 12v4M9 22l3-6 3 6" {...stroke(color)} />
      <Path d="M5 3.5c-1 1.2-1 3 0 4.2M19 3.5c1 1.2 1 3 0 4.2" {...stroke(color)} />
    </Svg>
  );
}

export function ShareIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" {...stroke(color)} />
    </Svg>
  );
}

export function DownloadIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M8 10l4 4 4-4M12 3v11" {...stroke(color)} />
    </Svg>
  );
}

/** Delete: red (`colors.rec`) everywhere in the app unless a screen has a reason to differ. */
export function TrashIcon({ color = colors.rec, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" {...stroke(color)} />
    </Svg>
  );
}

export function FilmIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Rect x="3" y="5" width="18" height="14" rx="2" {...stroke(color)} />
      <Path d="M10 9l5 3-5 3z" {...stroke(color)} />
    </Svg>
  );
}

export function PlayIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M8 5l11 7-11 7z" fill={color} />
    </Svg>
  );
}

export function PauseIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M8 5v14M16 5v14" {...stroke(color)} strokeWidth={3} />
    </Svg>
  );
}

export function ExpandIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...stroke(color)} />
    </Svg>
  );
}

export function CloseIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M6 6l12 12M18 6L6 18" {...stroke(color)} strokeWidth={2} />
    </Svg>
  );
}

export function RotateIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" {...stroke(color)} />
    </Svg>
  );
}

export function ShieldIcon({ color = colors.soft, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" {...stroke(color)} />
    </Svg>
  );
}

export function MicIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Rect x={9} y={2} width={6} height={12} rx={3} {...stroke(color)} />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v4" {...stroke(color)} />
    </Svg>
  );
}

export function RemoteIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M7 7l10 10-5 5V2l5 5L7 17" {...stroke(color)} />
    </Svg>
  );
}

export function WatchIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Rect x={6} y={6} width={12} height={12} rx={3} {...stroke(color)} />
      <Path d="M9 6V2h6v4M9 18v4h6v-4" {...stroke(color)} />
    </Svg>
  );
}

/** A padlock: a paid feature, opened by a purchase. */
export function LockIcon({ color = colors.text, size = 12 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Rect x={5} y={11} width={14} height={10} rx={2} {...stroke(color)} />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" {...stroke(color)} />
    </Svg>
  );
}

export function TapIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d="M9 11V5a1.5 1.5 0 0 1 3 0v6M12 10V4a1.5 1.5 0 0 1 3 0v7M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.5 15a1.5 1.5 0 0 1 2.5-1.7L9 16"
        {...stroke(color)}
      />
    </Svg>
  );
}

export function BackIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M15 6l-6 6 6 6" {...stroke(color)} strokeWidth={2} />
    </Svg>
  );
}

export function CheckIcon({ color = colors.onAccent, size = 72 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M5 12l5 5L20 7" {...stroke(color)} strokeWidth={2.6} />
    </Svg>
  );
}

/** A camera: opens the picture of what the camera phone sees. */
export function CameraIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 8h3l1.5-2h7L17 8h3v11H4z" {...stroke(color)} />
      <Circle cx={12} cy={13.5} r={3.5} {...stroke(color)} />
    </Svg>
  );
}

/** Four frame corners around a dot: the camera keeping the play in frame (Modo Foco). */
export function FocusIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" {...stroke(color)} />
      <Circle cx={12} cy={12} r={3} {...stroke(color)} />
    </Svg>
  );
}

/** A speedometer: the playback speed. */
export function SpeedIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 16a8 8 0 1 1 16 0M12 16l4-5" {...stroke(color)} />
    </Svg>
  );
}

/** A speaker with one wave: the clip's sound. */
export function SoundIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 10v4h4l5 4V6L8 10zM16.5 9a4 4 0 0 1 0 6" {...stroke(color)} />
    </Svg>
  );
}

/** A magnifier with a plus: zoom by hand. */
export function ZoomIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Circle cx={11} cy={11} r={6} {...stroke(color)} />
      <Path d="M20 20l-4.5-4.5M11 8v6M8 11h6" {...stroke(color)} />
    </Svg>
  );
}

/** A pencil: edit the clip. */
export function EditIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" {...stroke(color)} />
    </Svg>
  );
}

/** Rewind and play: the replay itself. It stands for a recording with nothing saved to watch again yet. */
export function ReplayIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M10 7.5L3.5 12l6.5 4.5z" {...stroke(color)} />
      <Path d="M13 6.5v11L21 12z" {...stroke(color)} />
    </Svg>
  );
}

/** A clip frame with a play triangle: a saved lance. */
export function ClipIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Rect x={3} y={5} width={18} height={14} rx={3} {...stroke(color)} />
      <Path d="M10.2 9.5v5l4.2-2.5z" {...stroke(color)} />
    </Svg>
  );
}

/** A crown: the mark of the Pro plan. */
export function CrownIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M3.5 8.5l4.5 4 4-7 4 7 4.5-4L19 17H5z" {...stroke(color)} />
      <Path d="M5.5 20.5h13" {...stroke(color)} />
    </Svg>
  );
}
