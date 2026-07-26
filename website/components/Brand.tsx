export function OrbitBrand({ center = false }: { center?: boolean }) {
  return (
    <div className="brand" style={center ? { justifyContent: 'center' } : undefined}>
      <img src="/1cloudhub-logo.png" alt="1CloudHub" className="brand-mark" height={20} />
      <span>
        ORBIT
        <small>AI apps for everyday life</small>
      </span>
    </div>
  );
}

export function CompassIcon({ size = 22, gradientId }: { size?: number; gradientId: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9.5" stroke={`url(#${gradientId})`} strokeWidth="1.6" />
      <path d="M15.2 8.8L10.6 10.6L8.8 15.2L13.4 13.4L15.2 8.8Z" fill={`url(#${gradientId})`} />
      <defs>
        <linearGradient id={gradientId} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B39DDB" />
          <stop offset="1" stopColor="#FFAB91" />
        </linearGradient>
      </defs>
    </svg>
  );
}
