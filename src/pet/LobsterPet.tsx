import React from 'react';

/**
 * 3D-cartoon "sticker" style lobster mascot.
 * Layered SVG primitives + radial gradients to fake spherical lighting
 * (key light from upper-left). Heavy outer outline keeps the chibi
 * sticker vibe legible at every size.
 */
const LobsterPet: React.FC = () => (
  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
    <defs>
      <radialGradient id="lp-body" cx="35%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#ff9a78" />
        <stop offset="45%" stopColor="#e94a2c" />
        <stop offset="100%" stopColor="#8a140f" />
      </radialGradient>
      <radialGradient id="lp-claw" cx="32%" cy="28%" r="85%">
        <stop offset="0%" stopColor="#ffa080" />
        <stop offset="50%" stopColor="#e94a2c" />
        <stop offset="100%" stopColor="#7a120e" />
      </radialGradient>
      <radialGradient id="lp-belly" cx="50%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#fff5dc" />
        <stop offset="100%" stopColor="#eec38a" />
      </radialGradient>
      <radialGradient id="lp-tail" cx="50%" cy="20%" r="90%">
        <stop offset="0%" stopColor="#ff8d6b" />
        <stop offset="100%" stopColor="#9a1a14" />
      </radialGradient>
      <radialGradient id="lp-eye" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#d8d4cc" />
      </radialGradient>
      <radialGradient id="lp-ground" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#3a0d05" stopOpacity="0.35" />
        <stop offset="70%" stopColor="#3a0d05" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#3a0d05" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* ─── Ground shadow ─── */}
    <ellipse cx="100" cy="188" rx="68" ry="9" fill="url(#lp-ground)" />

    {/* ─── Tail fan (behind body, low) ─── */}
    <g>
      <path
        d="M 56 150 Q 50 178 38 188 Q 70 184 100 184 Q 130 184 162 188 Q 150 178 144 150 Z"
        fill="#3a0d05"
      />
      <path
        d="M 60 152 Q 56 174 48 184 Q 76 180 100 180 Q 124 180 152 184 Q 144 174 140 152 Z"
        fill="url(#lp-tail)"
      />
      <path d="M 76 152 Q 72 170 66 182" stroke="#7a160f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M 100 152 L 100 182" stroke="#7a160f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M 124 152 Q 128 170 134 182" stroke="#7a160f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M 64 154 Q 100 150 136 154" stroke="#ffb89a" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6" />
    </g>

    {/* ─── Antennae (thin, curving forward, behind head) ─── */}
    <path d="M 86 50 Q 64 22 38 16" stroke="#3a0d05" strokeWidth="4.5" strokeLinecap="round" fill="none" />
    <path d="M 86 50 Q 64 22 38 16" stroke="#e94a2c" strokeWidth="2" strokeLinecap="round" fill="none" />
    <circle cx="38" cy="16" r="5" fill="#3a0d05" />
    <circle cx="38" cy="16" r="3" fill="#f5b840" />

    <path d="M 114 50 Q 136 22 162 16" stroke="#3a0d05" strokeWidth="4.5" strokeLinecap="round" fill="none" />
    <path d="M 114 50 Q 136 22 162 16" stroke="#e94a2c" strokeWidth="2" strokeLinecap="round" fill="none" />
    <circle cx="162" cy="16" r="5" fill="#3a0d05" />
    <circle cx="162" cy="16" r="3" fill="#f5b840" />

    {/* ─── Walking legs (peek under body, far back) ─── */}
    <g stroke="#3a0d05" strokeWidth="5" strokeLinecap="round" fill="none">
      <path d="M 76 144 Q 64 162 60 174" />
      <path d="M 88 150 Q 80 168 76 178" />
      <path d="M 112 150 Q 120 168 124 178" />
      <path d="M 124 144 Q 136 162 140 174" />
    </g>

    {/* ═══ Left claw — arm reaches OUT from side of body ═══ */}
    <g className="left-claw" style={{ transformOrigin: '60px 110px' }}>
      {/* upper arm */}
      <path d="M 62 114 Q 38 110 22 96" stroke="#3a0d05" strokeWidth="14" strokeLinecap="round" fill="none" />
      <path d="M 62 114 Q 38 110 22 96" stroke="url(#lp-claw)" strokeWidth="9" strokeLinecap="round" fill="none" />
      {/* elbow joint */}
      <circle cx="22" cy="96" r="9" fill="#3a0d05" />
      <circle cx="22" cy="96" r="6" fill="url(#lp-claw)" />
      {/* forearm */}
      <path d="M 22 96 Q 18 80 26 64" stroke="#3a0d05" strokeWidth="13" strokeLinecap="round" fill="none" />
      <path d="M 22 96 Q 18 80 26 64" stroke="url(#lp-claw)" strokeWidth="8" strokeLinecap="round" fill="none" />
      {/* PINCER built as two pointed ovals (upper + lower fingers) sharing a hinge */}
      {/* hinge / palm — fat circle behind the fingers */}
      <circle cx="30" cy="60" r="14" fill="#3a0d05" />
      <circle cx="30" cy="60" r="10.5" fill="url(#lp-claw)" />
      {/* upper finger (points up-left) */}
      <ellipse cx="14" cy="38" rx="14" ry="7" fill="#3a0d05" transform="rotate(-50 14 38)" />
      <ellipse cx="14" cy="38" rx="11" ry="4.5" fill="url(#lp-claw)" transform="rotate(-50 14 38)" />
      {/* lower finger (points down-left) */}
      <ellipse cx="14" cy="78" rx="14" ry="7" fill="#3a0d05" transform="rotate(50 14 78)" />
      <ellipse cx="14" cy="78" rx="11" ry="4.5" fill="url(#lp-claw)" transform="rotate(50 14 78)" />
      {/* dark V notch where the two fingers meet */}
      <path d="M 30 60 L 12 50 M 30 60 L 12 70" stroke="#2a0805" strokeWidth="2.5" strokeLinecap="round" />
      {/* finger tips (pointed black caps) */}
      <circle cx="2" cy="22" r="2.5" fill="#3a0d05" />
      <circle cx="2" cy="94" r="2.5" fill="#3a0d05" />
      {/* highlight on the hinge bulb */}
      <ellipse cx="26" cy="54" rx="4" ry="2.5" fill="#fff5dc" opacity="0.6" />
    </g>

    {/* ═══ Right claw (mirror) ═══ */}
    <g className="right-claw" style={{ transformOrigin: '140px 110px' }}>
      <path d="M 138 114 Q 162 110 178 96" stroke="#3a0d05" strokeWidth="14" strokeLinecap="round" fill="none" />
      <path d="M 138 114 Q 162 110 178 96" stroke="url(#lp-claw)" strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx="178" cy="96" r="9" fill="#3a0d05" />
      <circle cx="178" cy="96" r="6" fill="url(#lp-claw)" />
      <path d="M 178 96 Q 182 80 174 64" stroke="#3a0d05" strokeWidth="13" strokeLinecap="round" fill="none" />
      <path d="M 178 96 Q 182 80 174 64" stroke="url(#lp-claw)" strokeWidth="8" strokeLinecap="round" fill="none" />
      <circle cx="170" cy="60" r="14" fill="#3a0d05" />
      <circle cx="170" cy="60" r="10.5" fill="url(#lp-claw)" />
      <ellipse cx="186" cy="38" rx="14" ry="7" fill="#3a0d05" transform="rotate(50 186 38)" />
      <ellipse cx="186" cy="38" rx="11" ry="4.5" fill="url(#lp-claw)" transform="rotate(50 186 38)" />
      <ellipse cx="186" cy="78" rx="14" ry="7" fill="#3a0d05" transform="rotate(-50 186 78)" />
      <ellipse cx="186" cy="78" rx="11" ry="4.5" fill="url(#lp-claw)" transform="rotate(-50 186 78)" />
      <path d="M 170 60 L 188 50 M 170 60 L 188 70" stroke="#2a0805" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="198" cy="22" r="2.5" fill="#3a0d05" />
      <circle cx="198" cy="94" r="2.5" fill="#3a0d05" />
      <ellipse cx="174" cy="54" rx="4" ry="2.5" fill="#fff5dc" opacity="0.6" />
    </g>

    {/* ═══ Main body (round chibi torso) ═══ */}
    {/* outline */}
    <ellipse cx="100" cy="106" rx="58" ry="52" fill="#3a0d05" />
    {/* body fill with sphere shading */}
    <ellipse cx="100" cy="106" rx="54" ry="48" fill="url(#lp-body)" />

    {/* shell ridge across the back/top */}
    <path d="M 56 82 Q 100 70 144 82" stroke="#7a160f" strokeWidth="3" fill="none" opacity="0.7" />
    <path d="M 60 90 Q 100 80 140 90" stroke="#7a160f" strokeWidth="2" fill="none" opacity="0.5" />

    {/* big top-left highlight */}
    <ellipse cx="78" cy="74" rx="26" ry="16" fill="#ffb89a" opacity="0.55" />
    <ellipse cx="74" cy="68" rx="11" ry="6" fill="#fff5dc" opacity="0.7" />

    {/* belly plate */}
    <ellipse cx="100" cy="130" rx="34" ry="22" fill="#3a0d05" />
    <ellipse cx="100" cy="130" rx="31" ry="19" fill="url(#lp-belly)" />
    <path d="M 74 128 Q 100 134 126 128" stroke="#d29055" strokeWidth="2" fill="none" opacity="0.7" />
    <path d="M 76 138 Q 100 144 124 138" stroke="#d29055" strokeWidth="2" fill="none" opacity="0.7" />

    {/* ═══ Cheeks (blush) ═══ */}
    <ellipse cx="68" cy="118" rx="10" ry="6" fill="#ff7a9c" opacity="0.7" />
    <ellipse cx="132" cy="118" rx="10" ry="6" fill="#ff7a9c" opacity="0.7" />

    {/* ═══ Eyes (3D anime spheres) ═══ */}
    <ellipse cx="82" cy="104" rx="14" ry="16" fill="#3a0d05" />
    <ellipse cx="118" cy="104" rx="14" ry="16" fill="#3a0d05" />
    <ellipse cx="82" cy="104" rx="11" ry="13" fill="url(#lp-eye)" />
    <ellipse cx="118" cy="104" rx="11" ry="13" fill="url(#lp-eye)" />
    <ellipse cx="84" cy="106" rx="6.5" ry="8" fill="#1a1a1a" />
    <ellipse cx="120" cy="106" rx="6.5" ry="8" fill="#1a1a1a" />
    <ellipse cx="86" cy="101" rx="3" ry="3.6" fill="#ffffff" />
    <ellipse cx="122" cy="101" rx="3" ry="3.6" fill="#ffffff" />
    <circle cx="80" cy="110" r="1.4" fill="#ffffff" opacity="0.85" />
    <circle cx="116" cy="110" r="1.4" fill="#ffffff" opacity="0.85" />

    {/* ═══ Mouth (happy little smile, slightly open) ═══ */}
    <path d="M 90 138 Q 100 148 110 138" stroke="#3a0d05" strokeWidth="3" strokeLinecap="round" fill="none" />
    <path d="M 95 142 Q 100 146 105 142 Q 100 144 95 142 Z" fill="#7a160f" />
  </svg>
);

export default LobsterPet;
