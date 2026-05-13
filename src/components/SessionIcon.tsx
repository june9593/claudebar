import { claudePetVariant } from '../utils/claude-icon';

interface Props { projectKey: string; sessionId: string; size?: number; }

export function SessionIcon({ projectKey, sessionId, size = 22 }: Props) {
  const v = claudePetVariant(`${projectKey}:${sessionId}`);
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" shapeRendering="crispEdges">
      <rect x="28" y="38" width="64" height="46" fill={v.bodyColor} />
      <rect x="20" y="56" width="10" height="10" fill={v.handColor} />
      <rect x="90" y="56" width="10" height="10" fill={v.handColor} />
      <rect x="34" y="84" width="9" height="14" fill={v.legColor} />
      <rect x="48" y="84" width="9" height="14" fill={v.legColor} />
      <rect x="63" y="84" width="9" height="14" fill={v.legColor} />
      <rect x="77" y="84" width="9" height="14" fill={v.legColor} />
      <rect x="44" y="52" width="6" height="6" fill={v.eyeColor} />
      <rect x="70" y="52" width="6" height="6" fill={v.eyeColor} />
    </svg>
  );
}
