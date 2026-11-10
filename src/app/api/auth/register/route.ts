import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { hashPassword, signToken, AUTH_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = (body.username || '').trim();
    const password = body.password || '';

    if (!username || username.length < 3) {
      return NextResponse.json(
        { success: false, error: 'Имя пользователя должно содержать не менее 3 символов' },
        { status: 400 }
      );
    }

    if (!password || password.length < 4) {
      return NextResponse.json(
        { success: false, error: 'Пароль должен содержать не менее 4 символов' },
        { status: 400 }
      );
    }

    // Check allowed characters: letters, numbers, underscores, hyphens
    if (!/^[a-zA-Z0-9_\u0400-\u04FF-]+$/.test(username)) {
      return NextResponse.json(
        { success: false, error: 'Имя пользователя содержит недопустимые символы' },
        { status: 400 }
      );
    }

    const db = getDatabase();

    // Check if username already exists
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username);
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Пользователь с таким логином уже существует' },
        { status: 409 }
      );
    }

    // Hash password & save user
    const passwordHash = await hashPassword(password);
    const now = Date.now();

    const insertResult = db
      .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
      .run(username, passwordHash, now);

    const userId = Number(insertResult.lastInsertRowid);
    const token = signToken({ userId, username });

    const response = NextResponse.json({
      success: true,
      user: { id: userId, username },
    });

    // Set secure HTTP-only cookie for 30 days
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
    console.error('Registration error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Ошибка регистрации' },
      { status: 500 }
    );
  }
}
