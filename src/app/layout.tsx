import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0d14',
};

export const metadata: Metadata = {
  title: 'KinoStream — Онлайн-кинотеатр с P2P стримингом через TorrServer',
  description: 'Смотрите фильмы и сериалы прямо из торрент-раздач в браузере без предварительного скачивания с помощью TorrServer и Jackett.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark">
      <body className="min-h-screen flex flex-col bg-background text-zinc-100 antialiased selection:bg-primary selection:text-white">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
