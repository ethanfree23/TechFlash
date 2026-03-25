/** Live key for production builds (`vite build` / hosted deploy). */
export function getStripePublishableKey() {
  if (import.meta.env.DEV) {
    return (
      import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_TEST ||
      import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
      ''
    );
  }
  return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
}

export function isValidStripePublishableKey(key) {
  return typeof key === 'string' && key.length > 0 && key.startsWith('pk_');
}
