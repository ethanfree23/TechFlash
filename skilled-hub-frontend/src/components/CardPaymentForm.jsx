import React, { useState, useEffect, useRef } from 'react';

const cardStyle = {
  base: { fontSize: '16px', color: '#424770', '::placeholder': { color: '#aab7c4' } },
  invalid: { color: '#9e2146' },
};

/**
 * Reusable card payment form with separate labeled fields:
 * Card number, Name on card, Expiration (MM/YY), CVC
 * Uses Stripe Elements (cardNumber, cardExpiry, cardCvc)
 */
const CardPaymentForm = ({
  stripe: stripeProp,
  publishableKey,
  onConfirm,
  submitLabel = 'Add Card',
  disabled = false,
  amountLabel,
}) => {
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [nameOnCard, setNameOnCard] = useState('');
  const [cardReady, setCardReady] = useState(false);
  const cardNumberRef = useRef(null);
  const cardExpiryRef = useRef(null);
  const cardCvcRef = useRef(null);
  const cardNumberElRef = useRef(null);
  const cardExpiryElRef = useRef(null);
  const cardCvcElRef = useRef(null);
  const stripeRef = useRef(null);

  useEffect(() => {
    const stripeInstance = stripeProp || (window.Stripe && publishableKey && publishableKey !== 'pk_test_placeholder' ? window.Stripe(publishableKey) : null);
    if (!cardNumberRef.current || !stripeInstance) return;
    setCardReady(false);
    let mounted = true;
    const mount = () => {
      try {
        stripeRef.current = stripeInstance;
        const elements = stripeInstance.elements();
        const cardNumber = elements.create('cardNumber', { style: cardStyle });
        const cardExpiry = elements.create('cardExpiry', { style: cardStyle });
        const cardCvc = elements.create('cardCvc', { style: cardStyle });
        cardNumber.mount(cardNumberRef.current);
        cardExpiry.mount(cardExpiryRef.current);
        cardCvc.mount(cardCvcRef.current);
        if (mounted) {
          cardNumberElRef.current = cardNumber;
          cardExpiryElRef.current = cardExpiry;
          cardCvcElRef.current = cardCvc;
          setCardReady(true);
        } else {
          cardNumber.unmount();
          cardExpiry.unmount();
          cardCvc.unmount();
        }
        return () => {
          cardNumber.unmount();
          cardExpiry.unmount();
          cardCvc.unmount();
          cardNumberElRef.current = null;
          cardExpiryElRef.current = null;
          cardCvcElRef.current = null;
          stripeRef.current = null;
          setCardReady(false);
        };
      } catch (err) {
        if (mounted) setError('Could not load card form');
        return () => {};
      }
    };
    const cleanup = mount();
    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [stripeProp, publishableKey]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!cardNumberElRef.current || !cardReady || !stripeRef.current) {
      setError('Card form is not ready.');
      return;
    }
    setProcessing(true);
    try {
      await onConfirm({
        card: cardNumberElRef.current,
        billing_details: nameOnCard.trim() ? { name: nameOnCard.trim() } : undefined,
      });
    } catch (err) {
      setError(err.message || 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {amountLabel && <p className="text-gray-700">{amountLabel}</p>}
      <div className="space-y-4">
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
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={!cardReady || processing || disabled}
        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {processing ? 'Processing...' : submitLabel}
      </button>
    </form>
  );
};

export default CardPaymentForm;
