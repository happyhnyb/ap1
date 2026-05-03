'use client';

type Props = {
  className?: string;
  children: React.ReactNode;
};

export function LegalPolicyTrigger({ className = '', children }: Props) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event('kyc:open-legal-modal'))}
    >
      {children}
    </button>
  );
}
