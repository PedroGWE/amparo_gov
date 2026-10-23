import Image from 'next/image'
export function EducaBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`edu-brand${compact ? ' edu-brand-compact' : ''}`}
      aria-label="Educa Amparo GOV"
    >
      <Image unoptimized src="/brand/educa/educa-mark.svg" alt="" width={65} height={59} />
      <span className="edu-brand-word">
        <strong>Educa</strong>
        <span>
          Amparo<b>GOV</b>
        </span>
      </span>
    </span>
  )
}
