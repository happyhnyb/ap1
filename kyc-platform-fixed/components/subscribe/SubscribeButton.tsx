'use client';

export function SubscribeButton({ planName, price, period, featured }: { planName: string; price: string; period: string; featured: boolean }) {
  return (
    <button
      className={`btn ${featured ? 'btn-gold' : 'btn-primary'}`}
      style={{ width: '100%', justifyContent: 'center' }}
      onClick={() => alert(`Payment gateway integration pending.\n\nPlan: ${planName}\nPrice: ${price}${period}\n\nWire Razorpay or Stripe into /api/payment using the subscription adapter.`)}
    >
      Subscribe {price}{period}
    </button>
  );
}
