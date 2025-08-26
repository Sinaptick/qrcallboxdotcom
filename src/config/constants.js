export function validatePassword(pw) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pw);
}

export function mapAuthError(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "Email already in use.";
  if (code.includes("invalid-email")) return "Invalid email address.";
  if (code.includes("weak-password")) return "Password is too weak.";
  if (code.includes("wrong-password")) return "Incorrect password.";
  if (code.includes("user-not-found")) return "No account found for this email.";
  if (code.includes("too-many-requests")) return "Too many attempts. Try again later.";
  return err?.message || "Something went wrong.";
}