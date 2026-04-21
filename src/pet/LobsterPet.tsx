import React from 'react';

/**
 * Q-version (chibi) lobster mascot.
 * Front-facing pose with oversized raised claws, big anime eyes,
 * visible segmented tail, and forward-curving antennae.
 */
const LobsterPet: React.FC = () => (
  <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="pet-body-grad" cx="50%" cy="40%" r="70%">
        <stop offset="0%" stopColor="var(--pet-body-light)" />
        <stop offset="100%" stopColor="var(--pet-body)" />
      </radialGradient>
      <radialGradient id="pet-claw-grad" cx="40%" cy="40%" r="80%">
        <stop offset="0%" stopColor="var(--pet-body-light)" />
        <stop offset="100%" stopColor="var(--pet-body)" />
      </radialGradient>
    </defs>

    {/* ─── Tail (behind body, segmented fan) ─── */}
    <g>
      {/* tail segments curving down-back */}
      <path d="M28 55 Q40 72 52 55 Q50 62 40 64 Q30 62 28 55 Z" fill="var(--pet-body)" />
      <path d="M30 58 Q40 68 50 58" stroke="var(--pet-body-light)" strokeWidth="1.2" fill="none" opacity="0.7" />
      <path d="M32 62 Q40 70 48 62" stroke="var(--pet-body-light)" strokeWidth="1.2" fill="none" opacity="0.5" />
      {/* fan/telson */}
      <path d="M34 64 L30 75 L40 70 L50 75 L46 64 Z" fill="var(--pet-body)" />
      <path d="M40 64 L40 72" stroke="var(--pet-body-light)" strokeWidth="1" opacity="0.6" />
    </g>

    {/* ─── Antennae (long, forward-curving whiskers) ─── */}
    <path d="M30 22 Q18 8 8 4" stroke="var(--pet-body)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <path d="M50 22 Q62 8 72 4" stroke="var(--pet-body)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    {/* antenna tips */}
    <circle cx="8" cy="4" r="1.6" fill="var(--pet-body-light)" />
    <circle cx="72" cy="4" r="1.6" fill="var(--pet-body-light)" />

    {/* ─── Tiny walking legs underneath body ─── */}
    <path d="M26 50 Q22 56 22 60" stroke="var(--pet-body)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    <path d="M30 53 Q28 60 27 64" stroke="var(--pet-body)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    <path d="M50 53 Q52 60 53 64" stroke="var(--pet-body)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    <path d="M54 50 Q58 56 58 60" stroke="var(--pet-body)" strokeWidth="1.6" strokeLinecap="round" fill="none" />

    {/* ─── Main body / head (chibi rounded form) ─── */}
    <ellipse cx="40" cy="38" rx="20" ry="22" fill="url(#pet-body-grad)" />
    {/* belly highlight */}
    <ellipse cx="40" cy="44" rx="11" ry="10" fill="var(--pet-belly)" opacity="0.55" />

    {/* head shell ridge */}
    <path d="M22 30 Q40 22 58 30" stroke="var(--pet-body)" strokeWidth="1" fill="none" opacity="0.5" />

    {/* ─── Left claw (oversized, raised up) ─── */}
    <g className="left-claw" style={{ transformOrigin: '24px 38px' }}>
      {/* arm segment */}
      <path d="M24 38 Q16 30 12 22" stroke="var(--pet-body)" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      {/* pincer body */}
      <ellipse cx="9" cy="17" rx="8" ry="9" fill="url(#pet-claw-grad)" transform="rotate(-25 9 17)" />
      {/* upper pincer "finger" */}
      <path d="M3 11 Q1 6 5 4 Q9 6 8 12" fill="var(--pet-body)" />
      {/* lower pincer "finger" */}
      <path d="M5 22 Q3 26 8 27 Q12 25 11 20" fill="var(--pet-body)" />
      {/* mouth gap of pincer */}
      <path d="M6 14 L9 18" stroke="var(--pet-belly)" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      {/* highlight */}
      <ellipse cx="6" cy="14" rx="2" ry="3" fill="var(--pet-body-light)" opacity="0.6" />
    </g>

    {/* ─── Right claw (mirrored) ─── */}
    <g className="right-claw" style={{ transformOrigin: '56px 38px' }}>
      <path d="M56 38 Q64 30 68 22" stroke="var(--pet-body)" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <ellipse cx="71" cy="17" rx="8" ry="9" fill="url(#pet-claw-grad)" transform="rotate(25 71 17)" />
      <path d="M77 11 Q79 6 75 4 Q71 6 72 12" fill="var(--pet-body)" />
      <path d="M75 22 Q77 26 72 27 Q68 25 69 20" fill="var(--pet-body)" />
      <path d="M74 14 L71 18" stroke="var(--pet-belly)" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      <ellipse cx="74" cy="14" rx="2" ry="3" fill="var(--pet-body-light)" opacity="0.6" />
    </g>

    {/* ─── Cheeks (blush) ─── */}
    <ellipse cx="27" cy="42" rx="4" ry="3" fill="var(--pet-cheek)" opacity="0.85" />
    <ellipse cx="53" cy="42" rx="4" ry="3" fill="var(--pet-cheek)" opacity="0.85" />

    {/* ─── Eyes (big anime-style with shine) ─── */}
    <ellipse cx="32" cy="35" rx="5.5" ry="6.5" fill="var(--pet-eye-white)" />
    <ellipse cx="48" cy="35" rx="5.5" ry="6.5" fill="var(--pet-eye-white)" />
    <ellipse cx="33" cy="36" rx="3.4" ry="4.2" fill="var(--pet-eye-pupil)" />
    <ellipse cx="49" cy="36" rx="3.4" ry="4.2" fill="var(--pet-eye-pupil)" />
    {/* big shine */}
    <ellipse cx="34.5" cy="34" rx="1.4" ry="1.8" fill="var(--pet-eye-shine)" />
    <ellipse cx="50.5" cy="34" rx="1.4" ry="1.8" fill="var(--pet-eye-shine)" />
    {/* small secondary shine */}
    <circle cx="32" cy="38" r="0.8" fill="var(--pet-eye-shine)" opacity="0.7" />
    <circle cx="48" cy="38" r="0.8" fill="var(--pet-eye-shine)" opacity="0.7" />

    {/* ─── Mouth (small open smile) ─── */}
    <path d="M37 45 Q40 48.5 43 45" stroke="var(--pet-eye-pupil)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    <path d="M38.5 46 Q40 47.2 41.5 46" fill="var(--pet-cheek)" />
  </svg>
);

export default LobsterPet;
