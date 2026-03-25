import React, { useState, useEffect, useRef } from 'react';
import { paymentsAPI, jobsAPI } from '../api/api';
import { getStripePublishableKey, isValidStripePublishableKey } from '../stripeConfig';

const cardStyle = {
  base: { fontSize: '16px', color: '#424770', '::placeholder': { color: '#aab7c4' } },
  invalid: { color: '#9e2146' },
};

const AcceptPaymentModal = ({ isOpen, onClose, jobId, amountCents, onSuccess }) => {
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [nameOnCard, setNameOnCard] = useState('');
  const [cardReady, setCardReady] = useState(false);
  const cardNumberRef = useRef(null);
  const cardExpiryRef = useRef(null);
  const cardCvcRef = useRef(null);
  const cardNumberElRef = useRef(null);
  const stripeRef = useRef(null);

  const publishableKey = getStripePublishableKey();

  useEffect(() => {
    if (!isOpen || !cardNumberRef.current || !window.Stripe || !isValidStripePublishableKey(publishableKey)) return;
    setCardReady(false);
    try {
      const stripe = window.Stripe(publishableKey);
      stripeRef.current = stripe;
      const elements = stripe.elements();
      const cardNumber = elements.create('cardNumber', { style: cardStyle });
      const cardExpiry = elements.create('cardExpiry', { style: cardStyle });
      const cardCvc = elements.create('cardCvc', { style: cardStyle });
      cardNumber.mount(cardNumberRef.current);
      cardExpiry.mount(cardExpiryRef.current);
      cardCvc.mount(cardCvcRef.current);
      cardNumberElRef.current = cardNumber;
      setCardReady(true);
      return () => {
        cardNumber.unmount();
        cardExpiry.unmount();
        cardCvc.unmount();
        cardNumberElRef.current = null;
        stripeRef.current = null;
        setCardReady(false);
      };
    } catch {
      return () => {};
    }
  }, [isOpen, publishableKey]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!cardNumberElRef.current || !cardReady) return;
    setProcessing(true);
    try {
      const res = await paymentsAPI.createIntent(jobId);
      const clientSecret = res?.client_secret;
      if (!clientSecret) throw new Error('Could not create payment');
      const stripe = stripeRef.current;
      if (!stripe) throw new Error('Payment form not ready');
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardNumberElRef.current,
          billing_details: nameOnCard.trim() ? { name: nameOnCard.trim() } : undefined,
        },
      });
      if (confirmError) throw new Error(confirmError.message);
      if (paymentIntent?.status === 'succeeded') {
        await jobsAPI.accept(jobId, { payment_intent_id: paymentIntent.id });
        onSuccess?.();
        onClose();
      } else {
        throw new Error('Payment not completed');
      }
    } catch (err) {
      setError(err.message || 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  const amount = (amountCents / 100).toFixed(2);
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Payment</h2>
        <p className="text-gray-700 mb-4">
          Pay <span className="font-semibold">${amount}</span> to accept this technician. Funds are held until the job is complete and both parties have reviewed (or 3 days pass).
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Card number</label>
            <div ref={cardNumberRef} className="p-3 border border-gray-300 rounded-lg bg-white min-h-[42px]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name on card</label>
            <input
              type="text"
              value={nameOnCard}
              onChange={(e) => setNameOnCard(e.target.value)}
              placeholder="e.g. John Smith"
              className="w-full p-3 border border-gray-300 rounded-lg bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiration date (MM/YY)</label>
              <div ref={cardExpiryRef} className="p-3 border border-gray-300 rounded-lg bg-white min-h-[42px]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CVC</label>
              <div ref={cardCvcRef} className="p-3 border border-gray-300 rounded-lg bg-white min-h-[42px]" />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!cardReady || processing}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {processing ? 'Processing...' : `Pay $${amount} & Accept`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AcceptPaymentModal;
