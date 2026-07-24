import { getAdminsByEmail } from "./api.js";

/* =========================================================
   adminAuth.js
   ---------------------------------------------------------
   Purpose:
   Handles admin authentication and session management.
   Deliberately separate from auth.js (student sessions) so
   an admin session and a student session can never collide
   or be confused with one another.

   Responsibilities:
   ✓ Admin login
   ✓ Admin logout
   ✓ Save current admin
   ✓ Read current admin
   ✓ Protect admin pages
   ========================================================= */

const STORAGE_KEY = "currentAdmin";

/* =========================================================
   Login
   ========================================================= */

/**
 * Attempts to log in an admin using their email.
 *
 * @param {string} email
 * @param {string} password
 *
 * @returns {Object} { success: true, admin } or { success: false, message }
 */
export async function adminLogin(email, password) {
  email = email.trim();
  password = password.trim();

  const admins = await getAdminsByEmail(email);

  if (admins.length === 0) {
    return {
      success: false,
      message: "Invalid credentials",
    };
  }

  const admin = admins[0];

  if (admin.password !== password) {
    return {
      success: false,
      message: "Invalid credentials",
    };
  }

  // Never keep the password around in the session record.
  const { password: _omit, ...safeAdmin } = admin;

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safeAdmin));

  return {
    success: true,
    admin: safeAdmin,
  };
}

/* =========================================================
   Logout
   ========================================================= */

export function adminLogout() {
  sessionStorage.removeItem(STORAGE_KEY);
}

/* =========================================================
   Current Admin
   ========================================================= */

export function getCurrentAdmin() {
  const admin = sessionStorage.getItem(STORAGE_KEY);

  if (!admin) {
    return null;
  }

  return JSON.parse(admin);
}

/* =========================================================
   Authentication Status
   ========================================================= */

export function isAdminLoggedIn() {
  return getCurrentAdmin() !== null;
}

/* =========================================================
   Protect Pages
   ========================================================= */

export function requireAdminAuth(loginPage = "/assets/pages/admin/admin-login.html") {
  if (!isAdminLoggedIn()) {
    window.location.href = loginPage;
  }
}
