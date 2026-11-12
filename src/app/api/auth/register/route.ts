import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { hashPassword, signToken, AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Rate limit: 5 registrations per hour per IP
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`register:${clientIp}`, 5, 60 * 60 * 1000);
  if (!rateLimit.success) {
    return NextResponse.json(
      { success: false, error: 'Слишком много попыток регистрации. Повторите позже.' },
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

    if (rawUsername.length < 3 || rawUsername.length > 64) {
      return NextResponse.json(
        { success: false, error: 'Имя пользователя должно содержать от 3 до 64 символов' },
        { status: 400 }
      );
    }

    if (rawPassword.length < 8 || rawPassword.length > 256) {
      return NextResponse.json(
        { success: false, error: 'Пароль должен содержать от 8 до 256 символов' },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_\u0400-\u04FF-]+$/.test(rawUsername)) {
      return NextResponse.json(
        { success: false, error: 'Имя пользователя содержит недопустимые символы' },
        { status: 400 }
      );
    }

    const db = getDatabase();

    const existing = db
      .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)')
      .get(rawUsername);
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Пользователь с таким логином уже существует' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(rawPassword);
    const now = Date.now();

    let insertResult;
    try {
      insertResult = db
        .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
        .run(rawUsername, passwordHash, now);
    } catch (dbErr: any) {
      if (
        dbErr?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        dbErr?.code === 'SQLITE_CONSTRAINT' ||
        dbErr?.message?.includes('UNIQUE')
      ) {
        return NextResponse.json(
          { success: false, error: 'Пользователь с таким логином уже существует' },
          { status: 409 }
        );
      }
      throw dbErr;
    }

    const userId = Number(insertResult.lastInsertRowid);
    const token = signToken({ userId, username: rawUsername });

    const response = NextResponse.json({
      success: true,
      user: { id: userId, username: rawUsername },
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      ...AUTH_COOKIE_OPTIONS,
    });

    return response;
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось завершить регистрацию. Попробуйте позже.' },
      { status: 500 }
    );
  }
}
