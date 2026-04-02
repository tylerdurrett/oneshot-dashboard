import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767.98px)';

/**
 * Returns true when the viewport is narrower than the Tailwind `md` breakpoint
 * (768px). Updates reactively on window resize via matchMedia.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
