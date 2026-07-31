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

export async function createRegistration(data, actor = null) {
  const created = await request("/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (actor) {
    await createAuditLogEntry({
      entityType: "registration",
      entityId: created.id,
      action: "added",
      actorId: actor.actorId,
      actorRole: actor.actorRole || "admin",
      timestamp: new Date().toISOString(),
      previousValue: null,
      newValue: { courseId: data.courseId, type: data.type, session: data.session, semester: data.semester },
      note: actor.note || "Course added to registration.",
    });
  }

  return created;
}

export function updateRegistration(id, data) {
  return request(`/registrations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteRegistration(id, actor = null) {
  const result = await request(`/registrations/${id}`, { method: "DELETE" });

  if (actor) {
    await createAuditLogEntry({
      entityType: "registration",
      entityId: id,
      action: "removed",
      actorId: actor.actorId,
      actorRole: actor.actorRole || "admin",
      timestamp: new Date().toISOString(),
      previousValue: actor.previousValue || null,
      newValue: null,
      note: actor.note || "Course removed from registration.",
    });
  }

  return result;
}

/* =========================================================
   Append to api.js
   ========================================================= */

/* =========================================================
   UNIT LOAD POLICY
   ========================================================= */

export function getUnitLoadPolicy() {
  return request("/unitLoadPolicy");
}

/* =========================================================
   GRADUATION REQUIREMENTS
   ========================================================= */

export function getGraduationRequirements() {
  return request("/graduationRequirements");
}

/* =========================================================
   AUDIT LOG
   ========================================================= */

export function getAuditLog(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  });

  const query = params.toString();

  return request(`/auditLog${query ? `?${query}` : ""}`);
}

export function createAuditLogEntry(data) {
  return request("/auditLog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
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

/* =========================================================
   LECTURERS — new collection
   ========================================================= */

export function getLecturers() {
  return request("/lecturers");
}

export function getLecturerById(id) {
  return request(`/lecturers/${id}`);
}

export function getLecturersByEmail(email) {
  return request(`/lecturers?email=${encodeURIComponent(email)}`);
}

export function createLecturer(data) {
  return request("/lecturers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateLecturer(id, data) {
  return request(`/lecturers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteLecturer(id) {
  return request(`/lecturers/${id}`, { method: "DELETE" });
}

/* =========================================================
   COURSE ASSIGNMENTS — links a lecturer to a course
   ========================================================= */

export function getCourseAssignments(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null) params.append(k, v);
  });
  const query = params.toString();
  return request(`/courseAssignments${query ? `?${query}` : ""}`);
}

export function getCourseAssignmentById(id) {
  return request(`/courseAssignments/${id}`);
}

export function createCourseAssignment(data) {
  return request("/courseAssignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateCourseAssignment(id, data) {
  return request(`/courseAssignments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteCourseAssignment(id) {
  return request(`/courseAssignments/${id}`, { method: "DELETE" });
}

/* =========================================================
   RESULT SUBMISSIONS — one record per batch upload
   ========================================================= */

export function getResultSubmissions(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null) params.append(k, v);
  });
  const query = params.toString();
  return request(`/resultSubmissions${query ? `?${query}` : ""}`);
}

export function getResultSubmissionById(id) {
  return request(`/resultSubmissions/${id}`);
}

export async function createResultSubmission(data) {
  const created = await request("/resultSubmissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  await createAuditLogEntry({
    entityType: "resultSubmission",
    entityId: created.id,
    action: "submitted",
    actorId: data.lecturerId,
    actorRole: "lecturer",
    timestamp: new Date().toISOString(),
    previousValue: null,
    newValue: { courseId: data.courseId, session: data.session, semester: data.semester, version: data.version },
    note: `Submitted results for review (v${data.version ?? 1}).`,
  });

  return created;
}

export async function updateResultSubmission(id, data, actor = {}) {
  const updated = await request(`/resultSubmissions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (actor.actorId) {
    await createAuditLogEntry({
      entityType: "resultSubmission",
      entityId: id,
      action: data.status === "pending" ? "resubmitted" : "updated",
      actorId: actor.actorId,
      actorRole: actor.actorRole || "lecturer",
      timestamp: new Date().toISOString(),
      previousValue: null,
      newValue: { status: data.status, version: data.version },
      note: actor.note || `Resubmitted batch (v${data.version ?? "?"}).`,
    });
  }

  return updated;
}

/* =========================================================
   APPROVAL CASCADE
   ---------------------------------------------------------
   json-server cannot atomically update a submission AND all
   its linked result rows in one request.

   CHOSEN APPROACH: client-side sequential PATCHes with clear
   error handling. The admin clicks Approve/Reject, and the
   browser fires:
     1. PATCH /resultSubmissions/:id   (update status, reviewedBy, reviewedAt)
     2. PATCH /results/:id × N         (flip published = true for each row)

   TRADEOFF vs custom Express middleware:
   - Client-side is simpler for a beginner project — no extra
     server file to maintain, no Node.js middleware knowledge needed.
   - The risk of a "partial failure" (submission marked approved
     but some result rows not yet updated) is low in a local
     dev environment with json-server, but we mitigate it by:
       a) updating result rows FIRST, then the submission record.
       b) wrapping in try/catch and showing a clear error if
          any step fails — the admin can retry safely since
          PATCH is idempotent.
   ========================================================= */

/**
 * Approve a result submission batch.
 *
 * Steps (order matters for safety):
 *  1. Flip every linked result row to published: true
 *  2. Update submission status to "approved"
 *
 * @param {string} submissionId - ID of the resultSubmissions record
 * @param {Array}  resultIds    - Array of result record IDs in this batch
 * @param {string} adminId      - ID of the admin performing the review
 */
export async function approveSubmission(submissionId, resultIds, adminId) {
  // Step 1: publish all result rows first.
  // If this fails, the submission stays "pending" — safe to retry.
  await Promise.all(
    resultIds.map(rid =>
      request(`/results/${rid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: true }),
      })
    )
  );

  // Step 2: mark the submission as approved.
  const updated = await request(`/resultSubmissions/${submissionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "approved",
      reviewedBy: adminId,
      reviewedAt: new Date().toISOString(),
      rejectionReason: null,
    }),
  });

  await createAuditLogEntry({
    entityType: "resultSubmission",
    entityId: submissionId,
    action: "approved",
    actorId: adminId,
    actorRole: "admin",
    timestamp: new Date().toISOString(),
    previousValue: { status: "pending" },
    newValue: { status: "approved", resultsPublished: resultIds.length },
    note: `Approved and published ${resultIds.length} result(s).`,
  });

  return updated;
}

/**
 * Reject a result submission batch.
 *
 * Steps:
 *  1. Ensure all linked result rows stay published: false (they already are)
 *  2. Update submission status to "rejected" with a reason
 *
 * @param {string} submissionId    - ID of the resultSubmissions record
 * @param {string} adminId         - ID of the admin performing the review
 * @param {string} rejectionReason - Mandatory reason for rejection
 */
export async function rejectSubmission(submissionId, adminId, rejectionReason) {
  // For rejection we only update the submission record.
  // Result rows already have published: false and stay that way.
  const updated = await request(`/resultSubmissions/${submissionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "rejected",
      reviewedBy: adminId,
      reviewedAt: new Date().toISOString(),
      rejectionReason,
    }),
  });

  await createAuditLogEntry({
    entityType: "resultSubmission",
    entityId: submissionId,
    action: "rejected",
    actorId: adminId,
    actorRole: "admin",
    timestamp: new Date().toISOString(),
    previousValue: { status: "pending" },
    newValue: { status: "rejected" },
    note: rejectionReason,
  });

  return updated;
}

/* =========================================================
   CHANGE PASSWORD — self-service for all three roles
   ---------------------------------------------------------
   Each role stores its password in a different collection.
   json-server writes the PATCH straight back to db.json so
   the change is immediately persistent for every user.

   SECURITY NOTE: We first fetch the full record to verify
   the current password before writing the new one.  This
   avoids a situation where any caller can blindly overwrite
   a password without proving identity.
   ========================================================= */

/**
 * Change a user's password after verifying the current one.
 *
 * @param {object} opts
 * @param {'students'|'lecturers'|'admins'} opts.collection
 * @param {string|number}  opts.id          - record id
 * @param {string}         opts.currentPassword
 * @param {string}         opts.newPassword
 * @returns {{ success: boolean, message?: string }}
 */
export async function changePassword({ collection, id, currentPassword, newPassword }) {
  // 1. Fetch the live record — do NOT trust the session copy because
  //    the admin may have already reset the password server-side.
  const record = await request(`/${collection}/${id}`);

  // 2. Verify the supplied current password.
  if (record.password !== currentPassword) {
    return { success: false, message: "Current password is incorrect." };
  }

  // 3. Write the new password via PATCH — json-server persists to db.json.
  await request(`/${collection}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPassword }),
  });

  return { success: true };
}
