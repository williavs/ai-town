import { useState } from 'react';

const SESSION_KEY = 'ai-town-session-id';

export function useSessionId(): string {
  const [sessionId] = useState(() => {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
    return id;
  });
  return sessionId;
}
