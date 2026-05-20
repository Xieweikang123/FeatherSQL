type IconProps = { className?: string; size?: number };

const defaultSize = 14;

export function IconPlus({ className, size = defaultSize }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconHistory({ className, size = defaultSize }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconChevron({ className, size = 12 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconServer({ className, size = defaultSize }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="9.5" width="11" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5" cy="4.5" r="0.75" fill="currentColor" />
      <circle cx="5" cy="11.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

export function IconDatabase({ className, size = 13 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <ellipse cx="8" cy="4.5" rx="5" ry="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 4.5v4c0 1.1 2.24 2 5 2s5-.9 5-2v-4" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 8.5v3c0 1.1 2.24 2 5 2s5-.9 5-2v-3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function IconTable({ className, size = 12 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 7h11M6 3.5v9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function IconEdit({ className, size = 13 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M10.5 3.5l2 2L6 12H4v-2l6.5-6.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function IconTrash({ className, size = 13 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3.5 5h9M6 5V4h4v1M5.5 5v7h5V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPlay({ className, size = 12 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 4.5l6 3.5-6 3.5V4.5z" fill="currentColor" />
    </svg>
  );
}

export function IconUnplug({ className, size = 13 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 2v4M10 2v4M5 10h6M8 10v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconPlug({ className, size = 32 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path d="M18 14v8M30 14v8M14 28h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <rect x="16" y="28" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" opacity="0.5" />
    </svg>
  );
}

export function IconRefresh({ className, size = defaultSize }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13.5 2.5v3h-3M2.5 13.5v-3h3"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.2 5.8A5 5 0 0 0 4.2 4.5L2.5 2.5M3.8 10.2a5 5 0 0 0 8 1.3l1.7 2"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSpinner({ className, size = 14 }: IconProps) {
  return (
    <svg className={`animate-spin ${className ?? ""}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export function IconOpenInNewTab({ className, size = defaultSize }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9 2h5v5M14 2 8 8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
