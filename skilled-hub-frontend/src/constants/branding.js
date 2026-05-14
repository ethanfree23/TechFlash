/**
 * Public logo URLs. Bump `v` when replacing files in `public/` so browsers and CDNs
 * fetch the new asset instead of a cached copy.
 */
export const TECHFLASH_LOGO_NAV = '/techflash-logo.png?v=3';
export const TECHFLASH_LOGO_LOGIN = '/techflash-logo-login.png?v=3';

/** Company "Talk to Sales" — override with `VITE_TECHFLASH_SALES_HREF` (mailto: or https:). */
export const TECHFLASH_SALES_HREF =
  import.meta.env?.VITE_TECHFLASH_SALES_HREF ||
  'mailto:hello@techflash.com?subject=TechFlash%20for%20companies';
