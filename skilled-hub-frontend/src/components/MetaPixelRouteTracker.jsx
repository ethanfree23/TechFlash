import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackMetaPageView } from '../utils/metaPixel';

/**
 * Fires Meta Pixel PageView on client-side route changes.
 * Initial load PageView is handled in main.jsx; identical path+search is deduped.
 */
export default function MetaPixelRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    trackMetaPageView();
  }, [location.pathname, location.search]);

  return null;
}
