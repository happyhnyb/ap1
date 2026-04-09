import ContactForm from './ContactForm';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  return <ContactForm />;
}
