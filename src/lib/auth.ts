import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'kinostream_jwt_secret_dev_key_super_secure';
export const AUTH_COOKIE_NAME = 'kinostream_token';

export interface AuthUser {
  userId: number;
  username: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: AuthUser): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    return decoded;
  } catch {
    return null;
  }
}

export function getAuthUser(request: NextRequest): AuthUser | null {
  const cookie = request.cookies.get(AUTH_COOKIE_NAME);
  if (!cookie?.value) return null;
  return verifyToken(cookie.value);
}
