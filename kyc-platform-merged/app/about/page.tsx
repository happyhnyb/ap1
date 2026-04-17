import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about Know Your Commodity, its mission, leadership, and approach to market intelligence.',
};

const LEADERSHIP = [
  {
    name: 'Deepak Pareek',
    role: 'Chief Economist',
    bio: 'World Economic Forum Tech Pioneer with 25+ years of global expertise in strategic foresight and data-driven agri-trade analysis.',
    href: 'https://www.linkedin.com/in/dpareek/',
    cta: 'LinkedIn',
  },
  {
    name: 'Niraj Shah',
    role: 'COO',
    bio: 'Leverages 10+ years of expertise to drive strategic agri-market intelligence and data-driven trading growth.',
    href: 'https://www.linkedin.com/in/niraj-shah-a7116817/',
    cta: 'LinkedIn',
  },
  {
    name: 'Dhairya Pareek',
    role: 'CTO',
    bio: 'Dhairya Pareek leads KYC\'s technology vision, building the digital backbone behind our intelligence platform, data systems, and user experiences. He focuses on turning complex agricultural and commodity market signals into fast, reliable, and accessible tools that help stakeholders act with confidence across global markets.',
    href: 'https://www.linkedin.com/in/dhairya-pareek-9b9234213/',
    cta: 'LinkedIn',
  },
];

export default function AboutPage() {
  return (
    <main className="container section">
      <div className="card post-card" style={{ padding: 24, display: 'grid', gap: 24 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 'clamp(32px, 5vw, 42px)', margin: 0 }}>Know Your Commodity</h1>
          <p className="muted" style={{ marginTop: 10, fontSize: 16, lineHeight: 1.7 }}>
            Know Your Commodity (KYC) is a leading provider of strategic insights into the global agricultural markets.
            We specialize in delivering comprehensive, real-time data and analysis that empower stakeholders across the agriculture value chain, from farmers and agribusinesses to traders and investors, to make informed and proactive decisions.
          </p>
        </div>

        <section style={{ display: 'grid', gap: 14 }}>
          <h2 className="serif" style={{ fontSize: 28, margin: 0 }}>What We Do</h2>
          <p style={{ lineHeight: 1.75 }}>
            Know Your Commodity offers a deep dive into the dynamics of commodities trading, highlighting trends, pricing,
            supply-chain factors, and market forecasts. With our expert analysis, clients can anticipate market movements,
            understand the implications of global economic changes, and plan strategies with precision.
          </p>
          <p style={{ lineHeight: 1.75 }}>
            We believe that knowledge is power. That&apos;s why we focus on equipping our clients with the tools they need
            to analyze market conditions, evaluate investment opportunities, and maximize profitability. Our services include
            detailed market reports, personalized consulting, and user-friendly digital tools that provide critical insight
            into market behavior and trends.
          </p>
          <p style={{ lineHeight: 1.75 }}>
            Whether you are looking to expand agricultural operations, explore new markets, take data-driven trading decisions,
            or enhance your investment portfolio, KYC is your partner in navigating the complexities of global agriculture markets.
            We turn market intelligence into practical, actionable strategy.
          </p>
        </section>

        <div className="grid-two" style={{ display: 'grid', gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <h3 className="serif" style={{ marginBottom: 10 }}>Vision</h3>
            <p style={{ lineHeight: 1.7 }}>
              To be the global heartbeat of agricultural market intelligence, where every decision is powered by clarity and data.
            </p>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <h3 className="serif" style={{ marginBottom: 10 }}>Mission</h3>
            <p style={{ lineHeight: 1.7 }}>
              To provide the agricultural community with the strategic data and market foresight needed to navigate global supply chains,
              optimize investments, and drive sustainable growth.
            </p>
          </div>
        </div>

        <section style={{ display: 'grid', gap: 14 }}>
          <h2 className="serif" style={{ fontSize: 28, margin: 0 }}>Leadership</h2>
          <div className="grid-two" style={{ display: 'grid', gap: 16 }}>
            {LEADERSHIP.map((member) => (
              <div key={member.name} className="card" style={{ padding: 20 }}>
                <div className="badge badge-gold" style={{ marginBottom: 10 }}>{member.role}</div>
                <h3 className="serif" style={{ marginBottom: 6 }}>{member.name}</h3>
                <p className="muted" style={{ lineHeight: 1.7 }}>{member.bio}</p>
                <a href={member.href} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', marginTop: 10, display: 'inline-block' }}>
                  {member.cta} →
                </a>
              </div>
            ))}
          </div>
        </section>

        <section style={{ display: 'grid', gap: 14 }}>
          <h2 className="serif" style={{ fontSize: 28, margin: 0 }}>KYC and HnyB</h2>
          <p style={{ lineHeight: 1.75 }}>
            KYC is an initiative of HnyB Tech-Incubations Pvt. Ltd. HnyB operates at the intersection of agriculture, food,
            technology, and innovation. It is a boutique consulting firm with a systems-thinking approach, connecting dots across
            public institutions, private enterprises, startups, and multilateral bodies to unlock transformative growth.
          </p>
          <p style={{ lineHeight: 1.75 }}>
            HnyB works with stakeholders across the value chain including governments, PSUs, development agencies, research institutions,
            think tanks, corporates, startups, and innovators to address the most pressing challenges and opportunities in the agri-food-tech landscape.
          </p>
        </section>

        <section style={{ display: 'grid', gap: 14 }}>
          <h2 className="serif" style={{ fontSize: 28, margin: 0 }}>Flagship Event</h2>
          <p style={{ lineHeight: 1.75 }}>
            Commodity Week World, the online flagship event of KYC, is the premier intelligence hub where the global agricultural trading
            community converges to separate signal from noise. The event takes place every year in January and June.
          </p>
          <a href="https://www.linkedin.com/showcase/commodity-week/" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>
            Explore Commodity Week World →
          </a>
        </section>
      </div>
    </main>
  );
}
