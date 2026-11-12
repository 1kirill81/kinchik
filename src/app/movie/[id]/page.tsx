import React from 'react';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { tmdb } from '@/lib/tmdb';
import MovieDetailClient from './MovieDetailClient';

export const dynamic = 'force-dynamic';

interface MoviePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: MoviePageProps): Promise<Metadata> {
  const { id } = await params;
  const movie = await tmdb.getDetails(id, 'movie');
  if (!movie) return { title: 'Фильм не найден' };

  return {
    title: `${movie.title || movie.original_title} — Смотреть онлайн в высоком качестве`,
    description: movie.overview || 'Смотрите фильм онлайн в отличном качестве через P2P стрим.',
  };
}

export default async function MoviePage({ params }: MoviePageProps) {
  const { id } = await params;
  const movie = await tmdb.getDetails(id, 'movie');

  if (!movie) {
    notFound();
  }

  return <MovieDetailClient movie={movie} />;
}
