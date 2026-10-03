export const DISCLAIMER =
  'Prototype. Person detection uses a general model and may undercount in very dense crowds; production version would use a crowd-density model.'

export default function Footer({ className = '', children }) {
  return (
    <footer className={`flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] leading-snug text-dim ${className}`}>
      <p className="flex-1 min-w-[260px]">{DISCLAIMER}</p>
      {children}
      <nav className="flex gap-4">
        <a href="#terms" className="link">
          Terms
        </a>
        <a href="#privacy" className="link">
          Privacy
        </a>
      </nav>
    </footer>
  )
}
