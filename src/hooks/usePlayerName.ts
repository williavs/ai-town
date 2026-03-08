import { useState, useCallback } from 'react';

const NAME_KEY = 'ai-town-player-name';
const NAME_MAX_LENGTH = 16;
const NAME_PATTERN = /^[a-zA-Z0-9 ]+$/;

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Name is required';
  if (trimmed.length > NAME_MAX_LENGTH) return `Name must be ${NAME_MAX_LENGTH} characters or less`;
  if (!NAME_PATTERN.test(trimmed)) return 'Only letters, numbers, and spaces allowed';
  return null;
}

export function usePlayerName() {
  const [savedName, setSavedName] = useState<string | null>(() =>
    localStorage.getItem(NAME_KEY),
  );

  const saveName = useCallback((name: string) => {
    const trimmed = name.trim();
    localStorage.setItem(NAME_KEY, trimmed);
    setSavedName(trimmed);
  }, []);

  const clearName = useCallback(() => {
    localStorage.removeItem(NAME_KEY);
    setSavedName(null);
  }, []);

  return { savedName, saveName, clearName };
}
