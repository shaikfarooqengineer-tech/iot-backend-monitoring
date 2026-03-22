// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/utils/validation.js
// PURPOSE: Shared validation helpers used by Register, Login, CreateUserModal,
//          CreatePatientModal, EditUserModal. Returns error strings or null.
// ═══════════════════════════════════════════════════════════════════════════

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function emailError(email) {
  if (!email) return "Email is required";
  if (!isValidEmail(email)) return "Please enter a valid email address";
  return null;
}

export function passwordError(password) {
  if (!password) return "Password is required";
  if (password.length < 6) return "Password must be at least 6 characters";
  return null;
}

export function confirmPasswordError(password, confirmPassword) {
  if (!confirmPassword) return "Please confirm your password";
  if (password !== confirmPassword) return "Passwords do not match";
  return null;
}

export function requiredError(value, label = "This field") {
  if (!value || !value.toString().trim()) return `${label} is required`;
  return null;
}

/** Returns the first non-null error from a list of error strings. */
export function firstError(...errors) {
  return errors.find(e => e !== null && e !== undefined) || null;
}
