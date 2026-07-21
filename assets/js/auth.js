import {
  getStudentsByEmail,
  getStudentsByMatric
} from "./api.js";

/* =========================================================
   auth.js
   ---------------------------------------------------------
   Purpose:
   Handles authentication and session management.

   Responsibilities:
   ✓ Login
   ✓ Logout
   ✓ Save current student
   ✓ Read current student
   ✓ Protect pages

   Not responsible for:
   ✗ DOM manipulation
   ✗ API requests (delegates to api.js)
   ✗ Rendering UI
   ========================================================= */

const STORAGE_KEY = "currentStudent";

/* =========================================================
   Login
   ========================================================= */

/**
 * Attempts to log in using either an email or matric number.
 *
 * @param {string} identifier
 * @param {string} password
 *
 * @returns {Object}
 *
 * Example:
 * {
 *   success: true,
 *   student: {...}
 * }
 *
 * or
 *
 * {
 *   success:false,
 *   message:"Invalid password."
 * }
 */
export async function login(identifier, password) {
  identifier = identifier.trim();
  password = password.trim();

  const isEmail = identifier.includes("@");

  const students = isEmail
    ? await getStudentsByEmail(identifier)
    : await getStudentsByMatric(identifier);

  if (students.length === 0) {
    return {
      success: false,
      message: "Invalid credentials"
    };
  }

  const student = students[0];

  if (student.password !== password) {
    return {
      success: false,
      message: "Invalid credentials"
    };
  }

  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(student)
  );

  return {
    success: true,
    student
  };
}

/* =========================================================
   Logout
   ========================================================= */

export function logout() {
  sessionStorage.removeItem(STORAGE_KEY);
}

/* =========================================================
   Current Student
   ========================================================= */

export function getCurrentStudent() {
  const student = sessionStorage.getItem(STORAGE_KEY);

  if (!student) {
    return null;
  }

  return JSON.parse(student);
}

/* =========================================================
   Authentication Status
   ========================================================= */

export function isLoggedIn() {
  return getCurrentStudent() !== null;
}

/* =========================================================
   Protect Pages
   ========================================================= */


export function requireAuth(loginPage = "/assets/pages/login.html") {
  if (!isLoggedIn()) {
    window.location.href = loginPage;
  }
}