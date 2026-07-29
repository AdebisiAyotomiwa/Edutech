import { request } from "./api.js";

/* =========================================================
   lecturerAuth.js
   ---------------------------------------------------------
   Purpose:
   Handles lecturer authentication and session management.
   Deliberately separate from auth.js (students) and
   adminAuth.js (admins) so the three roles can never be
   confused at the session level.

   Responsibilities:
   ✓ Lecturer login (lookup by email in /lecturers)
   ✓ Lecturer logout
   ✓ Save / read current lecturer from sessionStorage
   ✓ Protect lecturer pages
   ========================================================= */

const STORAGE_KEY = "currentLecturer";

/* =========================================================
   Login
   ========================================================= */

/**
 * Look up a lecturer by email and validate the password.
 *
 * @param {string} email
 * @param {string} password
 * @returns {{ success: boolean, lecturer?: object, message?: string }}
 */
export async function lecturerLogin(email, password) {
  email    = email.trim();
  password = password.trim();

  // json-server supports simple equality filters via query params
  const lecturers = await request(`/lecturers?email=${encodeURIComponent(email)}`);

  if (!lecturers || lecturers.length === 0) {
    return { success: false, message: "Invalid credentials" };
  }

  const lecturer = lecturers[0];

  if (lecturer.password !== password) {
    return { success: false, message: "Invalid credentials" };
  }

  // Never store the raw password in the session
  const { password: _omit, ...safeLecturer } = lecturer;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safeLecturer));

  return { success: true, lecturer: safeLecturer };
}

/* =========================================================
   Logout
   ========================================================= */

export function lecturerLogout() {
  sessionStorage.removeItem(STORAGE_KEY);
}

/* =========================================================
   Current Lecturer
   ========================================================= */

export function getCurrentLecturer() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

/* =========================================================
   Auth Status
   ========================================================= */

export function isLecturerLoggedIn() {
  return getCurrentLecturer() !== null;
}

/* =========================================================
   Protect Pages
   ---------------------------------------------------------
   Call at the top of every lecturer page script.
   Redirects to the lecturer login page if no session exists.
   ========================================================= */

export function requireLecturerAuth(
  loginPage = "/assets/pages/lecturer/lecturer-login.html"
) {
  if (!isLecturerLoggedIn()) {
    window.location.href = loginPage;
  }
}
