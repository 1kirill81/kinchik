import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { comparePassword, signToken, AUTH_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = (body.username || '').trim();
    const password = body.password || '';

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Введите имя пользователя и пароль' },
        { status: 400 }
      );
    }

    const db = getDatabase();

    const user = db
      .prepare('SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER(?)')
      .get(username) as { id: number; username: string; password_hash: string } | undefined;

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Неверное имя пользователя или пароль' },
        { status: 401 }
      );
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Неверное имя пользователя или пароль' },
        { status: 401 }
      );
    }

    const token = signToken({ userId: user.id, username: user.username });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, username: user.username },
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Ошибка входа' },
      { status: 500 }
    );
  }
}
