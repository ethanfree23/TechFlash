/** Client-side password rules aligned with common signup UX (backend accepts >= 6). */
export const PASSWORD_MIN_LENGTH = 6;

export function validatePassword(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  const base = validatePassword(password);
  if (base) return base;
  if (password !== confirmation) return 'Password confirmation does not match.';
  return null;
}

export const PASSWORD_REQUIREMENT_HINT = `At least ${PASSWORD_MIN_LENGTH} characters. Use the same password you will use on techflash.app.`;
