/**
 * Password rules for sign-up. Returns an error message if the password
 * doesn't meet the policy, or null if it's fine. Re-used by the sign-up
 * form to validate before we hand the password to Supabase.
 *
 * Rules (chosen to be strict enough for a school project without being
 * annoyingly aggressive):
 *   - 8 to 64 characters
 *   - at least one uppercase letter
 *   - at least one number
 *   - at least one "special" character (anything that isn't a letter or
 *     digit, so spaces and unicode punctuation count too)
 */
export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (password.length > 64) {
    return "Password must be 64 characters or fewer.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password needs at least one uppercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password needs at least one number.";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password needs at least one special character (e.g. ! @ # $ %).";
  }
  return null;
}

/** Plain-English summary of the rules — shown under the password field
 *  so the user knows what to type before they hit submit. */
export const PASSWORD_RULES_HINT =
  "8-64 characters with at least one uppercase letter, one number, and one special character.";
