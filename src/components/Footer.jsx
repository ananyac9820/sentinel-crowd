export default function Footer({ className = '' }) {
  return (
    <p className={`text-[11px] leading-snug text-slate-500 ${className}`}>
      Prototype. Person detection uses a general model and may undercount in very dense crowds; production version
      would use a crowd-density model.
    </p>
  )
}
