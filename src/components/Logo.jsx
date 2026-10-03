// Mark: a camera view split into the 4x3 zone grid, one zone flagged.
export default function Logo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <g fill="none" stroke="#111111" strokeWidth="1.6">
        <rect x="3" y="6" width="26" height="20" />
        <path d="M9.5 6v20M16 6v20M22.5 6v20M3 12.7h26M3 19.3h26" />
      </g>
      <rect x="16" y="12.7" width="6.5" height="6.6" fill="#b02a22" />
    </svg>
  )
}
