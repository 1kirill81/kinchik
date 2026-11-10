import React from 'react';
import { Metadata } from 'next';
import FavoritesClient from './FavoritesClient';

export const metadata: Metadata = {
  title: 'Моё избранное — KinoStream',
  description: 'Список избранных фильмов и сериалов с сохраненным прогрессом просмотра.',
};

export default function FavoritesPage() {
  return <FavoritesClient />;
}
