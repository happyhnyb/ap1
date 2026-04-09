export function timeAgo(date: string | null) {
  if (!date) return 'Unpublished';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

export function fmtDate(date: string | null) {
  if (!date) return 'Draft';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export function sanitize(input: string) {
  return input.replace(/[<>]/g, '').trim();
}

export function generateId(prefix = '_') {
  return `${prefix}${Math.random().toString(36).slice(2, 11)}`;
}

export function generateSlug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}
