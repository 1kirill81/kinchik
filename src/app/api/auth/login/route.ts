import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { comparePassword, signToken, AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Rate limit: 10 attempts per 15 minutes per IP
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`login:${clientIp}`, 10, 15 * 60 * 1000);
  if (!rateLimit.success) {
    return NextResponse.json(
      { success: false, error: 'Слишком много попыток входа. Повторите через 15 минут.' },
      {
        status: 429,
        headers: { 'Retry-After': Math.ceil(rateLimit.resetMs / 1000).toString() },
      }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const rawUsername = typeof body.username === 'string' ? body.username.trim() : '';
    const rawPassword = typeof body.password === 'string' ? body.password : '';

    if (!rawUsername || !rawPassword || rawUsername.length > 64 || rawPassword.length > 256) {
      return NextResponse.json(
        { success: false, error: 'Неверное имя пользователя или пароль' },
        { status: 401 }
      );
    }

    const db = getDatabase();

    const user = db
      .prepare('SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER(?)')
      .get(rawUsername) as { id: number; username: string; password_hash: string } | undefined;

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Неверное имя пользователя или пароль' },
        { status: 401 }
      );
    }

    const isValid = await comparePassword(rawPassword, user.password_hash);
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
      ...AUTH_COOKIE_OPTIONS,
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'Ошибка входа' },
      { status: 500 }
    );
  }
}
