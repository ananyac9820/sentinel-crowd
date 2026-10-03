export default function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#161d2a" />
      <path
        d="M16 5l9 4v6c0 6-4 10-9 12-5-2-9-6-9-12V9z"
        fill="none"
        stroke="#818cf8"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="15" r="3" fill="#ef4444" />
    </svg>
  )
}
