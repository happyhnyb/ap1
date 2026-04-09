import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getAllPosts, getContacts, getUsers } from '@/lib/api';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';
import { postsAdapter } from '@/lib/adapters';
import { CATEGORIES } from '@/mocks/data';
import Link from 'next/link';

export const metadata: Metadata = { title: 'CMS Admin' };

const CHAR_LIMITS: Record<string, number> = { SHORT: 1000, STORY: 3000, ARTICLE: 10000 };

async function createPost(formData: FormData) {
  'use server';
  const session = await getServerSession();
  if (!isEditor(session)) redirect('/login');

  const title   = String(formData.get('title') || '');
  const excerpt = String(formData.get('excerpt') || '');
  const body    = String(formData.get('body') || '');
  const category = String(formData.get('category') || 'Crops');
  const type    = String(formData.get('type') || 'SHORT') as 'SHORT' | 'STORY' | 'ARTICLE';
  const tags    = String(formData.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean);
  const isPremium = formData.get('is_premium') === 'on';
  const linked  = String(formData.get('linked_article_id') || '') || null;
  const status  = String(formData.get('status') || 'draft') as 'draft' | 'published';

  await postsAdapter.create({
    title, excerpt, body, category, type, tags,
    is_premium: isPremium,
    linked_article_id: linked,
    author: session!.name,
    author_id: session!._id,
    status,
  });
  redirect('/admin');
}

export default async function AdminPage() {
  const session = await getServerSession();
  if (!isEditor(session)) redirect('/login');

  const [posts, contacts, users] = await Promise.all([getAllPosts(), getContacts(), getUsers()]);
  const published = posts.filter((p) => p.status === 'published');
  const drafts    = posts.filter((p) => p.status === 'draft');

  return (
    <main className="admin-shell">
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 28, margin: 0 }}>CMS Dashboard</h1>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 14 }}>
            Logged in as <strong>{session!.name}</strong> · {session!.role}
          </p>
        </div>
        <Link href="/" className="btn btn-sm">← Back to site</Link>
      </div>

      <div className="admin-grid">
        {/* Sidebar */}
        <aside className="card sidebar" style={{ alignSelf: 'start', position: 'sticky', top: 80 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 14, fontWeight: 600 }}>Overview</div>
          {[
            { label: 'Published', count: published.length, color: 'var(--green)' },
            { label: 'Drafts',    count: drafts.length,    color: 'var(--gold)' },
            { label: 'Archived',  count: posts.filter((p) => p.status === 'archived').length, color: 'var(--dim)' },
            { label: 'Users',     count: users.length,     color: 'var(--text)' },
            { label: 'Inbox',     count: contacts.length,  color: contacts.some((c) => c.status === 'new') ? 'var(--red)' : 'var(--text)' },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{item.label}</span>
              <span style={{ fontWeight: 700, color: item.color, fontFamily: 'Lora,serif' }}>{item.count}</span>
            </div>
          ))}

          <div style={{ marginTop: 20, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,193,7,.06)', border: '1px solid rgba(255,193,7,.2)', fontSize: 12, color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--gold)' }}>Char limits:</strong><br />
            SHORT: 1,000 · STORY: 3,000 · ARTICLE: 10,000
          </div>
        </aside>

        <div style={{ display: 'grid', gap: 20 }}>
          {/* Create post */}
          <div className="card admin-panel">
            <h2 className="serif" style={{ marginTop: 0, fontSize: 20 }}>Create Post</h2>
            <form action={createPost} className="form-grid">
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input className="field" name="title" placeholder="Headline" required />
              </div>
              <div className="form-group">
                <label className="form-label">Excerpt *</label>
                <textarea className="textarea" name="excerpt" rows={2} placeholder="One-sentence summary (max 500 chars)" required style={{ minHeight: 'unset' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Body * (use ## for section headings)</label>
                <textarea className="textarea" name="body" rows={12} placeholder="Article body. Use ## H2, ### H3, > for quotes." required />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '1 1 140px' }}>
                  <label className="form-label">Type</label>
                  <select className="select" name="type" defaultValue="SHORT">
                    <option value="SHORT">SHORT (≤1,000)</option>
                    <option value="STORY">STORY (≤3,000)</option>
                    <option value="ARTICLE">ARTICLE (≤10,000)</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 140px' }}>
                  <label className="form-label">Category</label>
                  <select className="select" name="category" defaultValue="Crops">
                    {CATEGORIES.filter((c) => c !== 'Top Stories').map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 120px' }}>
                  <label className="form-label">Status</label>
                  <select className="select" name="status" defaultValue="draft">
                    <option value="draft">Draft</option>
                    <option value="published">Publish</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Tags (comma-separated)</label>
                  <input className="field" name="tags" placeholder="wheat, monsoon, MSP" />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Linked article slug (for STORY → ARTICLE)</label>
                  <input className="field" name="linked_article_id" placeholder="article-slug-or-leave-blank" />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" name="is_premium" style={{ width: 16, height: 16 }} />
                  <span>Mark as Premium (★ Pro only)</span>
                </label>
              </div>

              <button className="btn btn-primary" type="submit">Save post</button>
            </form>
          </div>

          {/* Posts table */}
          <div className="card admin-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 className="serif" style={{ margin: 0, fontSize: 20 }}>All Posts ({posts.length})</h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Premium</th>
                    <th>Views</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p._id}>
                      <td>
                        <Link href={`/post/${p.slug}`} style={{ color: 'var(--green)', fontWeight: 500 }}>
                          {p.title.length > 50 ? p.title.slice(0, 50) + '…' : p.title}
                        </Link>
                      </td>
                      <td><span className="badge badge-type">{p.type}</span></td>
                      <td>{p.category}</td>
                      <td>
                        <span className={`badge ${p.status === 'published' ? 'badge-green' : p.status === 'draft' ? 'badge-gold' : ''}`}>
                          {p.status}
                        </span>
                      </td>
                      <td>{p.is_premium ? <span className="badge badge-gold" style={{ fontSize: 10 }}>★ Pro</span> : <span className="muted">—</span>}</td>
                      <td style={{ color: 'var(--muted)' }}>{p.view_count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Users table */}
          <div className="card admin-panel">
            <h2 className="serif" style={{ marginTop: 0, fontSize: 20 }}>Users ({users.length})</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Plan</th><th>Sub Status</th><th>Joined</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id}>
                      <td style={{ fontWeight: 500 }}>{u.name}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{u.email}</td>
                      <td><span className="badge">{u.role}</span></td>
                      <td>{u.subscription.plan}</td>
                      <td>
                        <span className={`badge ${u.subscription.status === 'active' ? 'badge-green' : ''}`}>
                          {u.subscription.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--dim)', fontSize: 12 }}>
                        {new Date(u.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inbox */}
          <div className="card admin-panel">
            <h2 className="serif" style={{ marginTop: 0, fontSize: 20 }}>Inbox ({contacts.length})</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Ref</th><th>Name</th><th>Email</th><th>Subject</th><th>Status</th><th>Submitted</th></tr></thead>
                <tbody>
                  {contacts.length ? contacts.map((c) => (
                    <tr key={c._id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--dim)' }}>{c.ref}</td>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{c.email}</td>
                      <td>{c.subject.length > 40 ? c.subject.slice(0, 40) + '…' : c.subject}</td>
                      <td><span className={`badge ${c.status === 'new' ? 'badge-gold' : ''}`}>{c.status}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--dim)' }}>{new Date(c.submitted_at).toLocaleString('en-IN')}</td>
                    </tr>
                  )) : <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0' }}>No submissions yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
