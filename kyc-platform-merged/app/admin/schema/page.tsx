import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';
import Link from 'next/link';

export const metadata: Metadata = { title: 'DB Schema — KYC Admin' };

type Field = { name: string; type: string; note?: string; ref?: string };

const models: { name: string; color: string; fields: Field[] }[] = [
  {
    name: 'User',
    color: '#4caf50',
    fields: [
      { name: '_id',                   type: 'ObjectId',       note: 'PK' },
      { name: 'name',                  type: 'String' },
      { name: 'email',                 type: 'String',         note: 'unique, indexed' },
      { name: 'mobile',                type: 'String | null',  note: 'sparse index' },
      { name: 'password_hash',         type: 'String | null' },
      { name: 'auth_methods',          type: 'String[]',       note: 'email | google' },
      { name: 'role',                  type: 'Enum',           note: 'reader | premium | editor | admin' },
      { name: 'stripe_customer_id',    type: 'String | null',  note: 'sparse index' },
      { name: 'subscription',          type: 'Embedded ↓',     note: 'see below' },
      { name: '  └ status',            type: 'Enum',           note: 'active | expired | cancelled | none' },
      { name: '  └ plan',              type: 'Enum',           note: 'free | monthly | annual' },
      { name: '  └ expires_at',        type: 'Date | null' },
      { name: '  └ stripe_subscription_id', type: 'String | null', note: 'sparse index' },
      { name: 'created_at',            type: 'Date',           note: 'auto' },
      { name: 'updated_at',            type: 'Date',           note: 'auto' },
    ],
  },
  {
    name: 'Post',
    color: '#ffc107',
    fields: [
      { name: '_id',               type: 'ObjectId',       note: 'PK' },
      { name: 'type',              type: 'Enum',           note: 'SHORT | STORY | ARTICLE' },
      { name: 'title',             type: 'String',         note: 'max 300' },
      { name: 'slug',              type: 'String',         note: 'unique, indexed' },
      { name: 'excerpt',           type: 'String',         note: 'max 500' },
      { name: 'body',              type: 'String',         note: 'markdown' },
      { name: 'author',            type: 'String' },
      { name: 'author_id',         type: 'String',         note: '→ User._id', ref: 'User' },
      { name: 'category',          type: 'String' },
      { name: 'tags',              type: 'String[]',       note: 'max 10' },
      { name: 'hero_image',        type: 'String | null',  note: 'R2 / public URL' },
      { name: 'inline_images',     type: 'String[]' },
      { name: 'is_premium',        type: 'Boolean' },
      { name: 'linked_article_id', type: 'String | null',  note: '→ Post._id (self)', ref: 'Post' },
      { name: 'status',            type: 'Enum',           note: 'draft | published | archived' },
      { name: 'published_at',      type: 'Date | null' },
      { name: 'view_count',        type: 'Number',         note: 'default 0' },
      { name: 'search_text',       type: 'String',         note: 'Atlas Search field' },
      { name: 'created_at',        type: 'Date' },
      { name: 'updated_at',        type: 'Date' },
    ],
  },
  {
    name: 'Contact',
    color: '#64b5f6',
    fields: [
      { name: '_id',          type: 'ObjectId', note: 'PK' },
      { name: 'name',         type: 'String' },
      { name: 'email',        type: 'String' },
      { name: 'subject',      type: 'String' },
      { name: 'message',      type: 'String' },
      { name: 'ref',          type: 'String',   note: 'unique short ID' },
      { name: 'status',       type: 'Enum',     note: 'new | read | resolved' },
      { name: 'submitted_at', type: 'Date',     note: 'indexed desc' },
    ],
  },
  {
    name: 'UsageLog',
    color: '#ce93d8',
    fields: [
      { name: '_id',              type: 'ObjectId', note: 'PK' },
      { name: 'user_id',          type: 'String',   note: '→ User._id, indexed', ref: 'User' },
      { name: 'feature',          type: 'Enum',     note: 'ai_search | predictor | export' },
      { name: 'query',            type: 'String | null' },
      { name: 'params',           type: 'Object' },
      { name: 'response_summary', type: 'String | null' },
      { name: 'timestamp',        type: 'Date',     note: 'TTL index: auto-delete after 90 days' },
    ],
  },
];

const relationships = [
  { from: 'Post',     field: 'author_id',         to: 'User',  toField: '_id',  label: 'written by' },
  { from: 'Post',     field: 'linked_article_id', to: 'Post',  toField: '_id',  label: 'deep-dive of' },
  { from: 'UsageLog', field: 'user_id',            to: 'User',  toField: '_id',  label: 'belongs to' },
];

export default async function SchemaPage() {
  const session = await getServerSession();
  if (!isEditor(session)) redirect('/login');

  return (
    <main className="admin-shell">
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 28, margin: 0 }}>Database Schema</h1>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 14 }}>MongoDB collections · Mongoose models</p>
        </div>
        <Link href="/admin" className="btn btn-sm">← Back to CMS</Link>
      </div>

      {/* Relationship summary */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 28, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600, alignSelf: 'center' }}>Relationships</div>
        {relationships.map((r) => (
          <div key={`${r.from}.${r.field}`} style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <code style={{ fontFamily: 'monospace', color: '#ffc107', fontSize: 12 }}>{r.from}.{r.field}</code>
            <span style={{ color: 'var(--dim)' }}>→</span>
            <code style={{ fontFamily: 'monospace', color: '#4caf50', fontSize: 12 }}>{r.to}.{r.toField}</code>
            <span style={{ color: 'var(--dim)', fontStyle: 'italic', fontSize: 12 }}>({r.label})</span>
          </div>
        ))}
      </div>

      {/* Model cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
        {models.map((model) => (
          <div key={model.name} className="card-elevated" style={{ overflow: 'hidden' }}>
            {/* Model header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 10, background: `${model.color}0d` }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: model.color, boxShadow: `0 0 8px ${model.color}80`, flexShrink: 0 }} />
              <span style={{ fontFamily: 'Lora,serif', fontSize: 17, fontWeight: 700, color: model.color }}>{model.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--dim)', letterSpacing: '.05em' }}>COLLECTION</span>
            </div>

            {/* Fields */}
            <div style={{ padding: '0 0 8px' }}>
              {model.fields.map((f, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 8,
                    padding: '8px 20px',
                    borderBottom: i < model.fields.length - 1 ? '1px solid var(--border)' : 'none',
                    background: f.name.startsWith('  ') ? 'rgba(255,255,255,.015)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{
                      fontFamily: 'monospace', fontSize: 12.5,
                      color: f.name === '_id' ? 'var(--dim)' : f.ref ? model.color : 'var(--text)',
                      whiteSpace: 'nowrap',
                    }}>
                      {f.name}
                    </code>
                    {f.ref && (
                      <span style={{ fontSize: 10, color: model.color, border: `1px solid ${model.color}44`, borderRadius: 4, padding: '1px 5px' }}>FK</span>
                    )}
                    {f.name === '_id' && (
                      <span style={{ fontSize: 10, color: 'var(--dim)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>PK</span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--green)', whiteSpace: 'nowrap' }}>{f.type}</span>
                    {f.note && (
                      <div style={{ fontSize: 10.5, color: 'var(--dim)', marginTop: 1 }}>{f.note}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Index summary */}
      <div className="card" style={{ padding: 20, marginTop: 28 }}>
        <h2 className="serif" style={{ fontSize: 18, margin: '0 0 16px' }}>Key Indexes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {[
            { model: 'User',     index: 'email',                           type: 'Unique' },
            { model: 'User',     index: 'stripe_customer_id',              type: 'Sparse' },
            { model: 'User',     index: 'subscription.stripe_subscription_id', type: 'Sparse' },
            { model: 'User',     index: 'subscription.status + expires_at', type: 'Compound' },
            { model: 'Post',     index: 'slug',                            type: 'Unique' },
            { model: 'Post',     index: 'status + published_at',           type: 'Compound' },
            { model: 'Post',     index: 'type + status',                   type: 'Compound' },
            { model: 'Post',     index: 'tags',                            type: 'Multi-key' },
            { model: 'Post',     index: 'title + excerpt + body + tags',   type: 'Full-text' },
            { model: 'Contact',  index: 'submitted_at',                    type: 'Desc' },
            { model: 'UsageLog', index: 'timestamp',                       type: 'TTL (90d)' },
            { model: 'UsageLog', index: 'user_id + timestamp',             type: 'Compound' },
          ].map((idx, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{idx.model}</span>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{idx.index}</div>
              </div>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(76,175,80,.1)', color: 'var(--green)', border: '1px solid rgba(76,175,80,.2)', whiteSpace: 'nowrap' }}>
                {idx.type}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
