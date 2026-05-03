import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getAllPosts, getContacts, getUsers } from '@/lib/api';
import { getServerSession } from '@/lib/auth/jwt';
import type { SessionPayload } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';
import { postsAdapter } from '@/lib/adapters';
import { CATEGORIES } from '@/mocks/data';
import Link from 'next/link';
import { ImageUpload } from '@/components/cms/ImageUpload';
import { DeletePostButton } from '@/components/cms/DeletePostButton';
import { PostBodyEditor } from '@/components/cms/PostBodyEditor';
import { SystemMonitor } from '@/components/admin/SystemMonitor';
import { stripDuplicateHeroImage } from '@/lib/posts/hero-image';
import { importLocalFileUrl } from '@/lib/storage/local-media';
import { normalizeStoredImageUrl } from '@/lib/media/url';
import { normalizePublishedAtInput, toDateInputValue } from '@/lib/posts/publish-date';

export const metadata: Metadata = { title: 'CMS Admin' };
const POSTS_PER_PAGE = 20;

async function requireEditorSession(): Promise<SessionPayload> {
  const session = await getServerSession();
  if (!session || !isEditor(session)) redirect('/login');
  return session;
}

async function getPostInput(formData: FormData, uploadedBy?: string | null) {
  const title   = String(formData.get('title') || '');
  const excerpt = String(formData.get('excerpt') || '');
  const body    = String(formData.get('body') || '');
  const category = String(formData.get('category') || 'Crops');
  const type    = String(formData.get('type') || 'SHORT') as 'SHORT' | 'STORY' | 'ARTICLE';
  const tags       = String(formData.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean);
  const isPremium  = formData.get('is_premium') === 'on';
  const status     = String(formData.get('status') || 'draft') as 'draft' | 'published' | 'archived';
  const seoTitle = String(formData.get('seo_title') || '').trim() || null;
  const seoDescription = String(formData.get('seo_description') || '').trim() || null;
  const publishedAt = normalizePublishedAtInput(String(formData.get('published_at') || ''));
  const rawHeroImage = String(formData.get('hero_image') || '').trim();
  let heroImage: string | null = normalizeStoredImageUrl(rawHeroImage) || null;

  // file:// URLs aren't reachable from the browser. Copy the file into local
  // media storage so it can be served from /api/media/...
  if (rawHeroImage.startsWith('file://')) {
    const imported = await importLocalFileUrl(rawHeroImage, uploadedBy);
    if (imported) heroImage = imported;
  }

  return {
    title,
    excerpt,
    body: stripDuplicateHeroImage(body, heroImage),
    category,
    type,
    tags,
    is_premium: isPremium,
    hero_image: heroImage,
    status,
    published_at: publishedAt,
    seo_title: seoTitle,
    seo_description: seoDescription,
  };
}

function buildAdminUrl(params: Record<string, string | null | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return query ? `/admin?${query}` : '/admin';
}

async function createPost(formData: FormData) {
  'use server';
  const session = await requireEditorSession();
  const page = String(formData.get('page') || '');
  try {
    await postsAdapter.create({
      ...(await getPostInput(formData, session._id)),
      author: session.name,
      author_id: session._id,
    });
    redirect(buildAdminUrl({ notice: 'post-created', page }));
  } catch (error) {
    redirect(buildAdminUrl({ error: error instanceof Error ? error.message : 'Failed to create post.', page }));
  }
}

async function publishPost(formData: FormData) {
  'use server';
  await requireEditorSession();

  const id = String(formData.get('id') || '');
  const page = String(formData.get('page') || '');
  if (!id) redirect('/admin');

  try {
    await postsAdapter.publishById(id);
    redirect(buildAdminUrl({ notice: 'post-published', page }));
  } catch (error) {
    redirect(buildAdminUrl({ error: error instanceof Error ? error.message : 'Failed to publish post.', page }));
  }
}

async function updatePost(formData: FormData) {
  'use server';
  const session = await requireEditorSession();

  const slug = String(formData.get('slug') || '');
  const page = String(formData.get('page') || '');
  if (!slug) redirect('/admin');

  try {
    await postsAdapter.update(slug, await getPostInput(formData, session._id));
    redirect(buildAdminUrl({ notice: 'post-updated', edit: slug, page }));
  } catch (error) {
    redirect(buildAdminUrl({ error: error instanceof Error ? error.message : 'Failed to update post.', edit: slug, page }));
  }
}

async function deletePost(formData: FormData) {
  'use server';
  await requireEditorSession();

  const id = String(formData.get('id') || '');
  const page = String(formData.get('page') || '');
  if (!id) redirect('/admin');

  try {
    await postsAdapter.deleteById(id);
    redirect(buildAdminUrl({ notice: 'post-deleted', page }));
  } catch (error) {
    redirect(buildAdminUrl({ error: error instanceof Error ? error.message : 'Failed to delete post.', page }));
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string; notice?: string; error?: string; page?: string }>;
}) {
  const session = await requireEditorSession();

  const [posts, contacts, users] = await Promise.all([getAllPosts(), getContacts(), getUsers()]);
  const { edit: editSlug = '', notice = '', error = '', page = '1' } = (await searchParams) ?? {};
  const visiblePosts = posts.filter((p) => p.status !== 'archived');
  const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const totalPages = Math.max(1, Math.ceil(visiblePosts.length / POSTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * POSTS_PER_PAGE;
  const paginatedPosts = visiblePosts.slice(pageStart, pageStart + POSTS_PER_PAGE);
  const published = visiblePosts.filter((p) => p.status === 'published');
  const drafts    = visiblePosts.filter((p) => p.status === 'draft');
  const postToEdit = editSlug ? posts.find((post) => post.slug === editSlug) ?? null : null;
  const formAction = postToEdit ? updatePost : createPost;
  const formTitle = postToEdit ? `Edit Post: ${postToEdit.title}` : 'Create Post';
  const submitLabel = postToEdit ? 'Update post' : 'Save post';
  const noticeMessages: Record<string, string> = {
    'post-created': 'Post created successfully.',
    'post-updated': 'Post updated successfully.',
    'post-published': 'Post published successfully.',
    'post-deleted': 'Post deleted successfully.',
  };

  return (
    <main className="admin-shell">
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 28, margin: 0 }}>CMS Dashboard</h1>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 14 }}>
            Logged in as <strong>{session.name}</strong> · {session.role}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/schema" className="btn btn-sm" style={{ fontSize: 12 }}>DB Schema</Link>
          <Link href="/" className="btn btn-sm">← Back to site</Link>
        </div>
      </div>

      {notice && noticeMessages[notice] ? (
        <div className="notice" style={{ marginBottom: 20, padding: '10px 14px' }}>
          {noticeMessages[notice]}
        </div>
      ) : null}

      {error ? (
        <div className="notice notice-red" style={{ marginBottom: 20, padding: '10px 14px' }}>
          {error}
        </div>
      ) : null}

      <div className="admin-grid">
        {/* Sidebar */}
        <aside className="card sidebar" style={{ alignSelf: 'start', position: 'sticky', top: 80 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 14, fontWeight: 600 }}>Overview</div>
          {[
            { label: 'Published', count: published.length, color: 'var(--green)' },
            { label: 'Drafts',    count: drafts.length,    color: 'var(--gold)' },
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
          <SystemMonitor />

          {/* Create or edit post */}
          <div className="card admin-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <h2 className="serif" style={{ margin: 0, fontSize: 20 }}>{formTitle}</h2>
              {postToEdit && (
                <Link href={buildAdminUrl({ page: String(safePage) })} className="btn btn-sm" style={{ fontSize: 12 }}>
                  Cancel editing
                </Link>
              )}
            </div>
            <form action={formAction} className="form-grid">
              {postToEdit && <input type="hidden" name="slug" value={postToEdit.slug} />}
              <input type="hidden" name="page" value={String(safePage)} />
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input className="field" name="title" placeholder="Headline" required defaultValue={postToEdit?.title ?? ''} />
              </div>
              <div className="form-group">
                <label className="form-label">Excerpt *</label>
                <textarea className="textarea" name="excerpt" rows={2} placeholder="One-sentence summary (max 500 chars)" required style={{ minHeight: 'unset' }} defaultValue={postToEdit?.excerpt ?? ''} />
              </div>
              <PostBodyEditor
                key={postToEdit?.slug ?? 'new-post'}
                defaultValue={postToEdit?.body ?? ''}
                heroImageUrl={postToEdit?.hero_image ?? null}
              />

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '1 1 140px' }}>
                  <label className="form-label">Type</label>
                  <select className="select" name="type" defaultValue={postToEdit?.type ?? 'SHORT'}>
                    <option value="SHORT">SHORT (≤1,000)</option>
                    <option value="STORY">STORY (≤3,000)</option>
                    <option value="ARTICLE">ARTICLE (≤10,000)</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 140px' }}>
                  <label className="form-label">Category</label>
                  <select className="select" name="category" defaultValue={postToEdit?.category ?? 'Crops'}>
                    {CATEGORIES.filter((c) => c !== 'Top Stories').map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 120px' }}>
                  <label className="form-label">Status</label>
                  <select className="select" name="status" defaultValue={postToEdit?.status ?? 'draft'}>
                    <option value="draft">Draft</option>
                    <option value="published">Publish</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Publish Date</label>
                <input
                  className="field"
                  type="date"
                  name="published_at"
                  defaultValue={toDateInputValue(postToEdit?.published_at ?? null)}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Tags (comma-separated)</label>
                  <input className="field" name="tags" placeholder="wheat, monsoon, MSP" defaultValue={postToEdit?.tags.join(', ') ?? ''} />
                </div>
              </div>

              <ImageUpload name="hero_image" label="Hero Image" initialUrl={postToEdit?.hero_image ?? null} />

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">SEO Title</label>
                  <input className="field" name="seo_title" placeholder="Optional SEO title" defaultValue={postToEdit?.seo_title ?? ''} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">SEO Description</label>
                  <input className="field" name="seo_description" placeholder="Optional SEO description" defaultValue={postToEdit?.seo_description ?? ''} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" name="is_premium" style={{ width: 16, height: 16 }} defaultChecked={postToEdit?.is_premium ?? false} />
                  <span>Mark as Premium (★ Pro only)</span>
                </label>
              </div>

              <button className="btn btn-primary" type="submit">{submitLabel}</button>
            </form>
          </div>

          {/* Posts table */}
          <div className="card admin-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <h2 className="serif" style={{ margin: 0, fontSize: 20 }}>All Posts ({visiblePosts.length})</h2>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Page {safePage} of {totalPages}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Premium</th>
                    <th>Views</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPosts.map((p) => (
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
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                        {p.published_at ? new Date(p.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td>{p.is_premium ? <span className="badge badge-gold" style={{ fontSize: 10 }}>★ Pro</span> : <span className="muted">—</span>}</td>
                      <td style={{ color: 'var(--muted)' }}>{p.view_count.toLocaleString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Link href={`/post/${p.slug}`} className="btn btn-sm" style={{ fontSize: 12 }}>
                            {p.status === 'published' ? 'Open' : 'Preview'}
                          </Link>
                          <Link href={buildAdminUrl({ edit: p.slug, page: String(safePage) })} className="btn btn-sm" style={{ fontSize: 12 }}>
                            Edit
                          </Link>
                          {p.status === 'draft' && (
                            <form action={publishPost}>
                              <input type="hidden" name="id" value={p._id} />
                              <input type="hidden" name="page" value={String(safePage)} />
                              <button className="btn btn-sm btn-primary" type="submit" style={{ fontSize: 12 }}>
                                Publish
                              </button>
                            </form>
                          )}
                          <form action={deletePost}>
                            <input type="hidden" name="id" value={p._id} />
                            <input type="hidden" name="page" value={String(safePage)} />
                            <DeletePostButton />
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
                <span style={{ fontSize: 12, color: 'var(--dim)' }}>
                  Showing {pageStart + 1}-{Math.min(pageStart + POSTS_PER_PAGE, visiblePosts.length)} of {visiblePosts.length}
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link
                    href={buildAdminUrl({ page: safePage > 1 ? String(safePage - 1) : '1', edit: editSlug || null })}
                    className="btn btn-sm"
                    style={{ fontSize: 12, pointerEvents: safePage === 1 ? 'none' : undefined, opacity: safePage === 1 ? 0.45 : 1 }}
                  >
                    Previous
                  </Link>
                  <Link
                    href={buildAdminUrl({ page: safePage < totalPages ? String(safePage + 1) : String(totalPages), edit: editSlug || null })}
                    className="btn btn-sm"
                    style={{ fontSize: 12, pointerEvents: safePage === totalPages ? 'none' : undefined, opacity: safePage === totalPages ? 0.45 : 1 }}
                  >
                    Next
                  </Link>
                </div>
              </div>
            ) : null}
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
