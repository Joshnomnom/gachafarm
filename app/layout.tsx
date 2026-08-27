import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://gachafarm-creature-bell.gogo01helo.chatgpt.site'),
  title: 'GachaFarm — Raise the Impossible',
  description: 'Summon unique animals, build an extraordinary idle farm, and chase mythical creatures.',
  openGraph: {
    title: 'GachaFarm — Raise the Impossible',
    description: 'Summon unique animals, build an extraordinary idle farm, and chase mythical creatures.',
    type: 'website',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: 'GachaFarm animals gathered around a magical summon bell' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GachaFarm — Raise the Impossible',
    description: 'Summon unique animals, build an extraordinary idle farm, and chase mythical creatures.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
