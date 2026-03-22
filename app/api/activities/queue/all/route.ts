import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getQueuePreview } from '@/lib/suggestion-queue';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Parse comma-separated exclude IDs (the 3 already on screen)
  const excludeParam = req.nextUrl.searchParams.get('exclude') ?? '';
  const excludeIds = excludeParam ? excludeParam.split(',').filter(Boolean) : [];

  const activities = await getQueuePreview(user.email, excludeIds);
  return NextResponse.json({ activities });
}
