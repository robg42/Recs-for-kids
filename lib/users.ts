import { getDb } from '@/lib/db';

export interface User {
  id: number;
  email: string;
  invitedBy: string | null;
  createdAt: string;
}

export async function isUserAllowed(email: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1',
    args: [email.trim()],
  });
  return result.rows.length > 0;
}

export async function listUsers(): Promise<User[]> {
  const db = getDb();
  const result = await db.execute(
    'SELECT id, email, invited_by, created_at FROM users ORDER BY created_at DESC'
  );
  return result.rows.map((r) => ({
    id: r.id as number,
    email: r.email as string,
    invitedBy: r.invited_by as string | null,
    createdAt: r.created_at as string,
  }));
}

export async function addUser(email: string, invitedBy: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO users (email, invited_by) VALUES (?, ?)',
    args: [email.trim().toLowerCase(), invitedBy],
  });
}

export async function removeUser(id: number): Promise<void> {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });
}
