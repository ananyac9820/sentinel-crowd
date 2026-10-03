// Small hand-drawn icon set. Used sparingly, only where a control needs one.

function Svg({ size = 14, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const PlayIcon = (p) => (
  <Svg {...p}>
    <path d="M4.5 3v10l8-5z" fill="currentColor" stroke="none" />
  </Svg>
)

export const PauseIcon = (p) => (
  <Svg {...p}>
    <path d="M5 3v10M11 3v10" strokeWidth="2.2" />
  </Svg>
)

export const RestartIcon = (p) => (
  <Svg {...p}>
    <path d="M3 8a5 5 0 1 0 1.6-3.7" />
    <path d="M3 2.5v3h3" />
  </Svg>
)

export const UploadIcon = (p) => (
  <Svg {...p}>
    <path d="M8 10.5V3M5 5.5l3-3 3 3M3 10.5v3h10v-3" />
  </Svg>
)

export const ChevronIcon = (p) => (
  <Svg {...p}>
    <path d="M4.5 6.5L8 10l3.5-3.5" />
  </Svg>
)

export const AlertIcon = (p) => (
  <Svg {...p}>
    <path d="M8 2l6.5 11.5h-13z" strokeLinejoin="miter" />
    <path d="M8 6.5v3.5M8 11.5v.5" />
  </Svg>
)

export const CloseIcon = (p) => (
  <Svg {...p}>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </Svg>
)
