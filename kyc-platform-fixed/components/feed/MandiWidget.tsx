import Link from 'next/link';
import { MANDI_PRICES } from '@/mocks/data';

export function MandiWidget() {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'Lora,serif', fontSize: 16, margin: 0 }}>Mandi Prices</h3>
        <span className="badge badge-green" style={{ fontSize: 10 }}>● Live</span>
      </div>
      <div>
        {MANDI_PRICES.map((item) => (
          <div key={item.crop} className="mandi-row">
            <span style={{ fontSize: 13, fontWeight: 500 }}>{item.crop}</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.price}</div>
              <div style={{ fontSize: 11, color: item.up ? 'var(--green)' : 'var(--red)' }}>{item.change}</div>
            </div>
          </div>
        ))}
      </div>
      <Link href="/premium/predictor" className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 14, fontSize: 12 }}>
        View full predictor ⚡
      </Link>
    </div>
  );
}
