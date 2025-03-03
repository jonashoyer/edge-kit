import { Metadata } from 'next';
import pkg from '../package.json';
import './global.css';

export const metadata = {
  title: pkg.name,
  description: (pkg as any).description,
  robots: {
    index: true,
    follow: true,
  },
} satisfies Metadata;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
