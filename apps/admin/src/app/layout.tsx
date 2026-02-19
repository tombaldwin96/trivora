import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mahan Admin',
  description: 'Content, users, live, reports',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 antialiased">{children}</body>
    </html>
  );
}
