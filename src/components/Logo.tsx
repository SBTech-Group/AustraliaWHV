export function Logo({ size = 36 }: { size?: number }) {
  const id = 'whv-gold'
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#F7E08A" />
          <stop offset="45%"  stopColor="#E2BE6A" />
          <stop offset="100%" stopColor="#9A6820" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="40" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#FFF0A0" />
          <stop offset="100%" stopColor="#C9952A" />
        </linearGradient>
      </defs>

      {/* Outer monitoring arc — 300° ring with gap at bottom-left */}
      <circle
        cx="20" cy="20" r="17"
        stroke={`url(#${id})`}
        strokeWidth="2.2"
        fill="none"
        strokeDasharray="89 18"
        strokeDashoffset="-4"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* Arrow tip at arc end — suggests scanning/notification */}
      <path d="M5.5 28 L3 31.5 L7.5 30.5Z" fill={`url(#${id})`} opacity="0.6" />

      {/*
        Southern Cross (Crux) — correct relative positions
        Alpha (α) = bottom, brightest
        Beta  (β) = left
        Gamma (γ) = top
        Delta (δ) = right
        Epsilon (ε) = small, between α and δ
      */}
      {/* γ Gamma — top */}
      <circle cx="20" cy="11" r="1.8"  fill={`url(#${id}-b)`} />
      {/* α Alpha — bottom, largest */}
      <circle cx="20" cy="29" r="2.4"  fill={`url(#${id})`} />
      {/* β Beta — left */}
      <circle cx="10" cy="21" r="1.6"  fill={`url(#${id}-b)`} />
      {/* δ Delta — right */}
      <circle cx="28" cy="17" r="1.4"  fill={`url(#${id})`} />
      {/* ε Epsilon — small, inside */}
      <circle cx="27" cy="26" r="0.95" fill={`url(#${id}-b)`} />
    </svg>
  )
}
