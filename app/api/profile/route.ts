import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUserChildren, setUserChildren } from '@/lib/users';
import type { ChildProfile } from '@/types';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const children = await getUserChildren(session.email);
  return NextResponse.json({ children });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { children } = body as { children?: unknown };

  if (!Array.isArray(children) || children.length > 10) {
    return NextResponse.json({ error: 'Invalid children' }, { status: 400 });
  }

  const validated: ChildProfile[] = [];
  for (const c of children) {
    if (
      typeof c !== 'object' ||
      c === null ||
      typeof (c as Record<string, unknown>).id !== 'string' ||
      typeof (c as Record<string, unknown>).name !== 'string' ||
      typeof (c as Record<string, unknown>).age !== 'number'
    ) {
      return NextResponse.json({ error: 'Invalid child entry' }, { status: 400 });
    }
    const child = c as { id: string; name: string; age: number };
    validated.push({
      id: child.id.slice(0, 64),
      name: child.name.slice(0, 50),
      age: Math.max(0, Math.min(17, Math.floor(child.age))),
    });
  }

  await setUserChildren(session.email, validated);
  return NextResponse.json({ ok: true });
}
