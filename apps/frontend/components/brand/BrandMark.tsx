/** Geometry of the approved mark (skill/zhengda-cup-champion/assets/brand/logo/mark.svg). */
export default function BrandMark({ size = 30, className }: { size?: number; className?: string }) {
  return <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true">
    <rect width="512" height="512" rx="104" fill="#F7F4ED"/>
    <circle cx="256" cy="256" r="190" fill="#0A1F33"/>
    <path d="M256 64 L316 304 L256 348 L196 304 Z" fill="#F4B942" stroke="#F7F4ED" strokeWidth="8" strokeLinejoin="round"/>
    <path d="M256 78 L286 286 L256 314 L226 286 Z" fill="#0A1F33" opacity="0.82"/>
    <g fill="#F7F4ED" stroke="#F4B942" strokeWidth="8"><circle cx="256" cy="126" r="17"/><circle cx="256" cy="184" r="17"/><circle cx="256" cy="242" r="17"/><circle cx="256" cy="300" r="17"/></g>
    <path d="M256 322 L330 382 L302 458 L210 458 L182 382 Z" fill="#00B3A4" stroke="#F4B942" strokeWidth="10" strokeLinejoin="round"/>
    <path d="M256 322 L256 458 M182 382 L330 382 M210 458 L256 382 L302 458" fill="none" stroke="#F7F4ED" strokeWidth="6" opacity="0.9"/>
  </svg>;
}
