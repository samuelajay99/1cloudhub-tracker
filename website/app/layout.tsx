import './globals.css';

export const metadata = {
  title: 'Orbit by 1CloudHub',
  description: 'A marketplace of AI-powered apps for everyday life — starting with Compass for notes, tasks, and follow-ups.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
