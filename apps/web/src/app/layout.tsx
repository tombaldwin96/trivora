import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mahan – Quiz & Compete',
  description: 'Daily quiz, 1v1 matches, live quizzes, and more.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
