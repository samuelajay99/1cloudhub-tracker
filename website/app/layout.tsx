import './globals.css';

export const metadata = {
  title: '1CloudHub Tracker',
  description: 'Notes, task extraction, and follow-ups — powered by Claude.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
