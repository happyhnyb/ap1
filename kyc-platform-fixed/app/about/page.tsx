import { TEAM } from '@/mocks/data';

export default function AboutPage() {
  return (
    <main className="container section">
      <div className="card post-card" style={{ padding: 24 }}>
        <h1 className="serif" style={{ fontSize: 38, margin: 0 }}>Know Your Commodity</h1>
        <p className="muted">India's commodity intelligence platform for farmers, agribusiness teams, traders, and policy watchers.</p>
        <h2 className="serif">Our Mission</h2>
        <p>Make agricultural intelligence accessible, readable, and operational. This frontend is production-structured and infra-pluggable, so MongoDB, auth, payments, and storage can be swapped in later without redoing the UI.</p>
        <h2 className="serif">Team</h2>
        <div className="grid-three">
          {TEAM.map((member) => (
            <div key={member.name} className="card post-card">
              <div className="logo-mark">{member.name[0]}</div>
              <strong>{member.name}</strong>
              <div className="muted">{member.role}</div>
              <div className="helper">{member.bio}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
