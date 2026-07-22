import { API_BASE_URL } from "./config.js";

/* =========================================================
   api.js
   ---------------------------------------------------------
   Purpose:
   A thin wrapper around the JSON Server API.

   Responsibilities:
   ✓ Send HTTP requests
   ✓ Return API responses

   Not responsible for:
   ✗ Authentication
   ✗ DOM manipulation
   ✗ Business logic
   ✗ GPA calculations
   ========================================================= */

/* =========================================================
   Generic Request Function
   ========================================================= */

export async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch (error) {
    throw new Error(`Network Error: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`API Error (${response.status})`);
  }

  return response.json();
}

/* =========================================================
   STUDENTS
   ========================================================= */

/**
 * Returns every student.
 */
export function getStudents() {
  return request("/students");
}

/**
 * Returns an array of students matching the email.
 * (Usually one or zero results.)
 */
export function getStudentsByEmail(email) {
  return request(
    `/students?email=${encodeURIComponent(email)}`
  );
}

/**
 * Returns an array of students matching the matric number.
 */
export function getStudentsByMatric(matricNumber) {
  return request(
    `/students?matricNumber=${encodeURIComponent(matricNumber)}`
  );
}

/**
 * Returns one student by ID.
 */
export function getStudentById(id) {
  return request(`/students/${id}`);
}

/* =========================================================
   DEPARTMENTS
   ========================================================= */

export function getDepartments() {
  return request("/departments");
}

export function getDepartmentById(id) {
  return request(`/departments/${id}`);
}

/* =========================================================
   COURSES
   ========================================================= */

export function getCourses(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  });

  const query = params.toString();

  return request(`/courses${query ? `?${query}` : ""}`);
}

export function getCourseById(id) {
  return request(`/courses/${id}`);
}

/* =========================================================
   RESULTS
   ========================================================= */

export function getResults(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  });

  const query = params.toString();

  return request(`/results${query ? `?${query}` : ""}`);
}

export function getResultById(id) {
  return request(`/results/${id}`);
}

/* =========================================================
   UPDATE (Used Later)
   ========================================================= */

/**
 * Update a student's information.
 * Example:
 * updateStudent(1, { phone: "08012345678" })
 */
export function updateStudent(id, data) {
  return request(`/students/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}

/* =========================================================
   ACADEMIC CALENDAR
   ========================================================= */

/**
 * Returns the single academic calendar record:
 * { currentSession: "2024/2025", currentSemester: 2 }
 */
export function getAcademicCalendar() {
  return request("/academicCalendar");
}

/* =========================================================
   REGISTRATIONS
   ========================================================= */

export function getRegistrations(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  });

  const query = params.toString();

  return request(`/registrations${query ? `?${query}` : ""}`);
}