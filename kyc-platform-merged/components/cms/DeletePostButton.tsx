'use client';

interface Props {
  children?: string;
}

export function DeletePostButton({ children = 'Delete' }: Props) {
  return (
    <button
      className="btn btn-sm"
      type="submit"
      style={{ fontSize: 12, color: 'var(--red)' }}
      onClick={(event) => {
        if (!window.confirm('Delete this post permanently? This cannot be undone.')) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
