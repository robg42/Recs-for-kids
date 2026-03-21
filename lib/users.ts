import { getDb } from '@/lib/db';
import type { ChildProfile } from '@/types';

export interface User {
  id: number;
  email: string;
  invitedBy: string | null;
  createdAt: string;
  isAdmin: boolean;
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
    'SELECT id, email, invited_by, created_at, is_admin FROM users ORDER BY created_at DESC'
  );
  return result.rows.map((r) => ({
    id: r.id as number,
    email: r.email as string,
    invitedBy: r.invited_by as string | null,
    createdAt: r.created_at as string,
    isAdmin: Boolean(r.is_admin),
  }));
}

export async function isUserAdmin(email: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT is_admin FROM users WHERE email = ? COLLATE NOCASE LIMIT 1',
    args: [email.trim()],
  });
  return Boolean(result.rows[0]?.is_admin);
}

export async function setUserAdmin(id: number, admin: boolean): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE users SET is_admin = ? WHERE id = ?',
    args: [admin ? 1 : 0, id],
  });
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

export async function getUserChildren(email: string): Promise<ChildProfile[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT children_json FROM users WHERE email = ? COLLATE NOCASE LIMIT 1',
    args: [email.trim()],
  });
  const raw = result.rows[0]?.children_json as string | null;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ChildProfile[];
  } catch {
    return [];
  }
}

export async function setUserChildren(email: string, children: ChildProfile[]): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE users SET children_json = ? WHERE email = ? COLLATE NOCASE',
    args: [JSON.stringify(children), email.trim()],
  });
}
