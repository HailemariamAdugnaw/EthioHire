
/** EthioHire logo mark — emerald shield + amber spark, drawn inline as SVG */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#15803d" />
      <path
        d="M24 9 L37 14 V24 C37 32.5 31.5 38 24 40.5 C16.5 38 11 32.5 11 24 V14 Z"
        fill="#ffffff"
        fillOpacity="0.12"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect x="16" y="20" width="16" height="12" rx="2.5" fill="#ffffff" />
      <path d="M20 20 V17.5 A2.5 2.5 0 0 1 22.5 15 H25.5 A2.5 2.5 0 0 1 28 17.5 V20" stroke="#ffffff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="33.5" cy="13.5" r="4" fill="#f59e0b" stroke="#15803d" strokeWidth="1.5" />
    </svg>
  );
}
