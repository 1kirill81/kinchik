import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import WatchClient from './WatchClient';

export const metadata: Metadata = {
  title: 'Просмотр фильма онлайн — KinoStream',
};

export default function WatchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin text-primary mr-2" />
          <span>Подготовка видеоплеера...</span>
        </div>
      }
    >
      <WatchClient />
    </Suspense>
  );
}
