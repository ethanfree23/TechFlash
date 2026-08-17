import { getStripePublishableKey, isValidStripePublishableKey } from '../stripeConfig';

export async function confirmStripeCardPayment(clientSecret) {
  const key = getStripePublishableKey();
  if (!isValidStripePublishableKey(key) || typeof window === 'undefined' || !window.Stripe) {
    throw new Error('Stripe is not configured to complete this payment.');
  }
  const stripe = window.Stripe(key);
  const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret);
  if (error) throw new Error(error.message || 'Payment confirmation failed.');
  return paymentIntent;
}
