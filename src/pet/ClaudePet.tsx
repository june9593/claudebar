import React from 'react';

/**
 * Claude pet mascot — chunky pixel-art critter, after Anthropic's Claude
 * pixel sticker. Square orange body, two black square eyes, and two small
 * red/orange "hand" squares poking out the left and right sides.
 *
 * The hand rectangles live inside .left-claw / .right-claw groups so the
 * existing pet.css idle / wave-claw / squish / bounce animations apply
 * just like LobsterPet's claws.
 */
const ClaudePet: React.FC = () => {
  // Palette
  const orange = '#cc785c';
  const orangeShadow = '#a04e30';
  const eye = '#0a0a0a';

  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%' }}
      shapeRendering="crispEdges"
    >
      {/* Body — chunky rounded square block. */}
      <rect x="28" y="38" width="64" height="46" fill={orange} />

      {/* Top notches give the pixel-rounded silhouette */}
      <rect x="28" y="38" width="6" height="6" fill="transparent" />
      <rect x="86" y="38" width="6" height="6" fill="transparent" />
      {/* Bottom notches */}
      <rect x="28" y="78" width="6" height="6" fill="transparent" />
      <rect x="86" y="78" width="6" height="6" fill="transparent" />

      {/* Subtle inner shadow on the right edge for chunky depth */}
      <rect x="84" y="44" width="8" height="34" fill={orangeShadow} opacity="0.20" />

      {/* Hands — small red/orange squares poking out the sides. Wrapped
          in .left-claw / .right-claw so the existing wave / squish CSS
          animations attach. */}
      <g className="left-claw" style={{ transformOrigin: '24px 60px' }}>
        <rect x="20" y="56" width="10" height="10" fill={orange} />
        <rect x="22" y="58" width="6" height="6" fill={orangeShadow} opacity="0.25" />
      </g>
      <g className="right-claw" style={{ transformOrigin: '96px 60px' }}>
        <rect x="90" y="56" width="10" height="10" fill={orange} />
        <rect x="92" y="58" width="6" height="6" fill={orangeShadow} opacity="0.25" />
      </g>

      {/* Eyes — two black square pixels */}
      <rect x="44" y="52" width="9" height="9" fill={eye} />
      <rect x="67" y="52" width="9" height="9" fill={eye} />
    </svg>
  );
};

export default ClaudePet;
