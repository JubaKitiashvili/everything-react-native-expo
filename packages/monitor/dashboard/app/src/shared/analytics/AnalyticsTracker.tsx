import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageview } from './analytics';

/**
 * Fires a (sanitized, PII-free) pageview on every route change. Renders
 * nothing. Must live INSIDE the app's <BrowserRouter> so `useLocation` works.
 *
 * When analytics is unconfigured or Do Not Track is on, `trackPageview` is a
 * silent no-op, so mounting this unconditionally is safe.
 */
export function AnalyticsTracker(): null {
  const location = useLocation();

  useEffect(() => {
    // Include the raw search so the sanitizer can strip it; never log it.
    trackPageview(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}
