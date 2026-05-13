export interface NexusOpsSession {
  token: string;
  user?: {
    id?: string;
    email?: string;
    role?: string;
    name?: string;
  };
}

const SESSION_KEY = 'nexusops_session';

export function saveSession(session: NexusOpsSession) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): NexusOpsSession | null {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated(): boolean {
  const session = getSession();
  return !!session?.token;
}
