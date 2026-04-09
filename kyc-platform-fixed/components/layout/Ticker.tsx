export function Ticker() {
  const text = 'Kharif sowing up 12% on early monsoon · Wheat MSP raised to ₹2,425/quintal · Tomato prices crash in Karnataka · Organic exports jump 48% · Locust alert for Rajasthan-Gujarat border · ';
  return (
    <div className="ticker">
      <div className="container">
        <div className="ticker-track">{text.repeat(4)}</div>
      </div>
    </div>
  );
}
