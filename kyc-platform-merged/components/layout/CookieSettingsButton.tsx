'use client';

type CookieSettingsButtonProps = {
  className?: string;
  label?: string;
};

export function CookieSettingsButton({
  className = '',
  label = 'Cookie settings',
}: CookieSettingsButtonProps) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        window.dispatchEvent(new Event('kyc:open-cookie-banner'));
      }}
    >
      {label}
    </button>
  );
}
