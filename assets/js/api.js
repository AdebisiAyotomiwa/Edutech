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
   FACULTIES
   ========================================================= */

export function getFaculties() {
  return request("/faculties");
}

export function createFaculty(data) {
  return request("/faculties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateFaculty(id, data) {
  return request(`/faculties/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteFaculty(id) {
  return request(`/faculties/${id}`, { method: "DELETE" });
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

export function createRegistration(data) {
  return request("/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateRegistration(id, data) {
  return request(`/registrations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteRegistration(id) {
  return request(`/registrations/${id}`, { method: "DELETE" });
}

/* =========================================================
   ADMINS
   ========================================================= */

export function getAdminsByEmail(email) {
  return request(`/admins?email=${encodeURIComponent(email)}`);
}

/* =========================================================
   STUDENTS — Admin CRUD (used later)
   ========================================================= */

export function createStudent(data) {
  return request("/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteStudent(id) {
  return request(`/students/${id}`, { method: "DELETE" });
}

/**
 * Admin-only. Sets a NEW password for a student without ever reading
 * the old one back — admins can reset access, they cannot view a
 * student's existing password.
 */
export function resetStudentPassword(id, newPassword) {
  return request(`/students/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPassword }),
  });
}

/* =========================================================
   DEPARTMENTS — Admin CRUD
   ========================================================= */

export function createDepartment(data) {
  return request("/departments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateDepartment(id, data) {
  return request(`/departments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteDepartment(id) {
  return request(`/departments/${id}`, { method: "DELETE" });
}

/* =========================================================
   COURSES — Admin CRUD
   ========================================================= */

export function createCourse(data) {
  return request("/courses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateCourse(id, data) {
  return request(`/courses/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteCourse(id) {
  return request(`/courses/${id}`, { method: "DELETE" });
}

/* =========================================================
   RESULTS — Admin CRUD
   ========================================================= */

export function createResult(data) {
  return request("/results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateResult(id, data) {
  return request(`/results/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteResult(id) {
  return request(`/results/${id}`, { method: "DELETE" });
}

/* =========================================================
   ACADEMIC CALENDAR — Admin update
   ========================================================= */

export function updateAcademicCalendar(data) {
  return request(`/academicCalendar`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}