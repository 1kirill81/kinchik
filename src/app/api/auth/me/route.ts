import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ success: true, user: null });
  }

  return NextResponse.json({
    success: true,
    user: { id: user.userId, username: user.username },
  });
}
