import ContactForm from './ContactForm';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact Know Your Commodity for editorial, enterprise, research access, or product inquiries.',
};

export default function ContactPage() {
  return <ContactForm />;
}
