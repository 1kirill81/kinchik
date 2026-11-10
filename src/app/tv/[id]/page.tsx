import React from 'react';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { tmdb } from '@/lib/tmdb';
import TVDetailClient from './TVDetailClient';

export const dynamic = 'force-dynamic';

interface TVPageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: TVPageProps): Promise<Metadata> {
  const tv = await tmdb.getDetails(params.id, 'tv');
  if (!tv) return { title: 'Сериал не найден' };

  return {
    title: `${tv.name || tv.original_name} — Смотреть все сезоны онлайн`,
    description: tv.overview || 'Смотрите все серии сериала онлайн в высоком качестве через P2P стриминг.',
  };
}

export default async function TVPage({ params }: TVPageProps) {
  const tv = await tmdb.getDetails(params.id, 'tv');

  if (!tv) {
    notFound();
  }

  return <TVDetailClient tv={tv} />;
}
