import { requireLecturerAuth, getCurrentLecturer, lecturerLogout } from "../lecturerAuth.js";
import {
  getCourseAssignments, getCourses, getAcademicCalendar,
  getRegistrations, getStudents,
  getResultSubmissions, createResultSubmission, updateResultSubmission,
  getResults, createResult, updateResult,
} from "../api.js";
import { scoreToGrade } from "../utils.js";

requireLecturerAuth();

/* ── State ──────────────────────────────────────────────── */
let lecturer      = null;
let calendar      = null;
let assignments   = [];   // this lecturer's courseAssignments
let courses       = [];
let students      = [];
let registrations = [];
let submissions   = [];   // existing resultSubmissions for this lecturer
let results       = [];   // all existing results

/* Currently loaded course */
let selectedCourseId   = null;
let selectedCourse     = null;
let existingSubmission = null;   // resultSubmission record if one already exists

/* ── Bootstrap modals ───────────────────────────────────── */
let submitConfirmModal;

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    lecturer = getCurrentLecturer();
    if (!lecturer) {
      window.location.href = "/assets/pages/lecturer/lecturer-login.html";
      return;
    }

    setupSidebar();
    setupLogout();
    submitConfirmModal = new bootstrap.Modal(document.getElementById("submitConfirmModal"));

    await loadData();
    populateCourseSelect();

    // Check for ?courseId= query param (coming from lecturer-courses.html)
    const params = new URLSearchParams(window.location.search);
    const preselectedId = params.get("courseId");
    if (preselectedId) {
      document.getElementById("courseSelect").value = preselectedId;
    }

    document.getElementById("pageLoading").classList.add("d-none");
    document.getElementById("pageContent").classList.remove("d-none");

    // If a course was pre-selected, auto-load it
    if (preselectedId) loadCourse();

    // Wire up events
    document.getElementById("loadCourseBtn").addEventListener("click", loadCourse);
    document.getElementById("submitBtn").addEventListener("click", openSubmitConfirm);
    document.getElementById("confirmSubmitBtn").addEventListener("click", handleSubmit);
  } catch (err) {
    console.error(err);
    document.getElementById("pageLoading").innerHTML =
      `<div class="alert alert-danger mb-0">Failed to load page. Please refresh.</div>`;
  }
}

/* ── Data ───────────────────────────────────────────────── */
async function loadData() {
  [assignments, courses, calendar, students, registrations, submissions, results] = await Promise.all([
    getCourseAssignments({ lecturerId: lecturer.id }),
    getCourses(),
    getAcademicCalendar(),
    getStudents(),
    getRegistrations(),
    getResultSubmissions({ lecturerId: lecturer.id }),
    getResults(),
  ]);
}

/* ── Course select dropdown ─────────────────────────────── */
function populateCourseSelect() {
  // Only show assignments for the current session/semester
  const currAssignments = assignments.filter(
    a => a.session === calendar.currentSession &&
         Number(a.semester) === Number(calendar.currentSemester)
  );

  const sel = document.getElementById("courseSelect");
  if (currAssignments.length === 0) {
    sel.innerHTML = `<option value="">No courses assigned for this semester</option>`;
    document.getElementById("loadCourseBtn").disabled = true;
    return;
  }

  sel.innerHTML = `<option value="">— Choose a course —</option>` +
    currAssignments.map(a => {
      const c = courses.find(co => String(co.id) === String(a.courseId));
      return c ? `<option value="${c.id}">${c.courseCode} — ${c.courseTitle}</option>` : "";
    }).join("");
}

/* ── Load course & students ─────────────────────────────── */
function loadCourse() {
  const courseId = document.getElementById("courseSelect").value;
  if (!courseId) {
    showSubmitStatus("Please select a course first.", "warning");
    return;
  }

  selectedCourseId = courseId;
  selectedCourse   = courses.find(c => String(c.id) === String(courseId));
  existingSubmission = submissions.find(
    s => String(s.courseId) === String(courseId) &&
         s.session           === calendar.currentSession &&
         Number(s.semester)  === Number(calendar.currentSemester)
  );

  renderCourseInfoBanner();
  renderStatusNotices();
  renderStudentTable();

  document.getElementById("scoreEntrySection").classList.remove("d-none");
}

/* ── Course info banner ─────────────────────────────────── */
function renderCourseInfoBanner() {
  document.getElementById("courseInfoBanner").innerHTML = `
    <div class="d-flex align-items-center gap-3 flex-wrap">
      <div class="lecturer-course-icon" style="flex-shrink:0;"><i class="bi bi-journal-text"></i></div>
      <div>
        <div class="fw-bold" style="font-family:var(--font-display);">${selectedCourse.courseCode} — ${selectedCourse.courseTitle}</div>
        <div class="text-muted small">${calendar.currentSession} · Semester ${calendar.currentSemester} · ${selectedCourse.level} Level · ${selectedCourse.creditUnit} credit units</div>
      </div>
    </div>`;
}

/* ── Status notices ─────────────────────────────────────── */
function renderStatusNotices() {
  // Hide all notices first
  ["pendingNotice", "approvedNotice", "rejectedNotice"].forEach(id =>
    document.getElementById(id).classList.add("d-none")
  );
  const submitBtn = document.getElementById("submitBtn");
  const actionBar = document.getElementById("actionBar");

  if (!existingSubmission) {
    // No prior submission — enable editing
    submitBtn.disabled  = false;
    actionBar.classList.remove("d-none");
    return;
  }

  if (existingSubmission.status === "pending") {
    document.getElementById("pendingNotice").classList.remove("d-none");
    submitBtn.disabled = true;
    actionBar.classList.remove("d-none");
  } else if (existingSubmission.status === "approved") {
    document.getElementById("approvedNotice").classList.remove("d-none");
    submitBtn.disabled = true;
    actionBar.classList.add("d-none");
  } else if (existingSubmission.status === "rejected") {
    document.getElementById("rejectedNotice").classList.remove("d-none");
    document.getElementById("rejectionReasonText").textContent = existingSubmission.rejectionReason || "—";
    submitBtn.disabled  = false;
    actionBar.classList.remove("d-none");
  }
}

/* ── Student table ──────────────────────────────────────── */
function renderStudentTable() {
  // Find students registered for this course in the current session/semester
  const courseRegs = registrations.filter(r =>
    String(r.courseId) === String(selectedCourseId) &&
    r.session           === calendar.currentSession &&
    Number(r.semester)  === Number(calendar.currentSemester)
  );

  const scoreTableWrap  = document.getElementById("scoreTableWrap");
  const noStudentsEmpty = document.getElementById("noStudentsEmpty");

  document.getElementById("scoreTableCount").textContent =
    `${courseRegs.length} student${courseRegs.length === 1 ? "" : "s"}`;

  if (courseRegs.length === 0) {
    scoreTableWrap.classList.add("d-none");
    noStudentsEmpty.classList.remove("d-none");
    document.getElementById("actionBar").classList.add("d-none");
    return;
  }

  scoreTableWrap.classList.remove("d-none");
  noStudentsEmpty.classList.add("d-none");

  // Is editing locked? (pending or approved submissions are read-only)
  const isLocked = existingSubmission &&
    (existingSubmission.status === "pending" || existingSubmission.status === "approved");

  const tbody = document.getElementById("scoreTbody");
  tbody.innerHTML = courseRegs.map((reg, idx) => {
    const student = students.find(s => String(s.id) === String(reg.studentId));
    if (!student) return "";

    // Look up any existing result for this student/course from the current submission.
    // Primary match: by submissionId (set when uploaded via lecturer portal).
    // Fallback: match by student/course/session/semester (covers legacy admin-entered rows).
    const existingResult = results.find(r =>
      String(r.studentId) === String(student.id) &&
      String(r.courseId)  === String(selectedCourseId) &&
      r.session            === calendar.currentSession &&
      Number(r.semester)   === Number(calendar.currentSemester) &&
      (existingSubmission
        ? String(r.submissionId) === String(existingSubmission.id)
        : true)
    );

    const score = existingResult ? existingResult.score : "";
    const grade = score !== "" ? scoreToGrade(Number(score)).grade : "—";

    // Read-only display for locked states
    const inputHtml = isLocked
      ? `<input type="number" class="form-control score-input" value="${score}" disabled style="width:90px;">`
      : `<input type="number" class="form-control score-input" data-student-id="${student.id}"
             data-result-id="${existingResult ? existingResult.id : ""}"
             min="0" max="100" value="${score}" placeholder="0–100"
             style="width:90px;" />`;

    return `<tr data-student-id="${student.id}" data-course-id="${selectedCourseId}">
      <td class="text-muted-cell">${idx + 1}</td>
      <td>
        <div class="d-flex align-items-center gap-2">
          <span class="student-avatar-mini">${(student.firstName[0] + student.lastName[0]).toUpperCase()}</span>
          <span class="fw-semibold">${student.firstName} ${student.lastName}</span>
        </div>
      </td>
      <td class="text-muted-cell">${student.matricNumber}</td>
      <td>${inputHtml}</td>
      <td class="grade-preview fw-semibold">${grade !== "—" ? `<span class="badge-grade badge-grade--${grade.toLowerCase()}">${grade}</span>` : "—"}</td>
    </tr>`;
  }).join("");

  // Wire up live grade preview on each score input
  tbody.querySelectorAll(".score-input:not([disabled])").forEach(input => {
    input.addEventListener("input", () => {
      const row   = input.closest("tr");
      const val   = input.value.trim();
      const gradeCell = row.querySelector(".grade-preview");
      if (val === "" || isNaN(Number(val))) {
        gradeCell.innerHTML = "—";
      } else {
        const { grade } = scoreToGrade(Number(val));
        gradeCell.innerHTML = `<span class="badge-grade badge-grade--${grade.toLowerCase()}">${grade}</span>`;
      }
      updateValidationSummary();
    });
  });

  updateValidationSummary();
}

/* ── Validation summary ─────────────────────────────────── */
function updateValidationSummary() {
  const inputs  = Array.from(document.querySelectorAll("#scoreTbody .score-input:not([disabled])"));
  const filled  = inputs.filter(i => i.value.trim() !== "").length;
  const invalid = inputs.filter(i => {
    const v = Number(i.value.trim());
    return i.value.trim() !== "" && (isNaN(v) || v < 0 || v > 100);
  }).length;

  const summary = document.getElementById("validationSummary");
  if (invalid > 0) {
    summary.innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i>${invalid} invalid score${invalid > 1 ? "s" : ""} — must be 0–100</span>`;
  } else {
    summary.innerHTML = `${filled} / ${inputs.length} scores entered`;
  }
}

/* ── Submit confirm modal ───────────────────────────────── */
function openSubmitConfirm() {
  const inputs   = Array.from(document.querySelectorAll("#scoreTbody .score-input:not([disabled])"));
  const filled   = inputs.filter(i => i.value.trim() !== "").length;
  const invalid  = inputs.filter(i => {
    const v = Number(i.value.trim());
    return i.value.trim() !== "" && (isNaN(v) || v < 0 || v > 100);
  }).length;

  if (filled === 0) {
    showSubmitStatus("Enter at least one score before submitting.", "warning");
    return;
  }
  if (invalid > 0) {
    showSubmitStatus(`Fix ${invalid} invalid score${invalid > 1 ? "s" : ""} before submitting.`, "danger");
    return;
  }

  const missingCount = inputs.length - filled;
  let bodyText = `${filled} score${filled === 1 ? "" : "s"} for ${selectedCourse.courseCode}.`;
  if (missingCount > 0) {
    bodyText += ` Note: ${missingCount} student${missingCount === 1 ? "" : "s"} will have no score recorded.`;
  }
  document.getElementById("submitConfirmBody").textContent = bodyText;
  submitConfirmModal.show();
}

/* ── Handle actual submit ───────────────────────────────── */
async function handleSubmit() {
  const confirmBtn = document.getElementById("confirmSubmitBtn");
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Submitting…`;

  try {
    const inputs = Array.from(document.querySelectorAll("#scoreTbody .score-input:not([disabled])"));
    const scoreRows = inputs
      .filter(i => i.value.trim() !== "")
      .map(i => ({
        studentId: i.dataset.studentId,
        resultId:  i.dataset.resultId,   // empty string if no existing record
        score:     Number(i.value.trim()),
      }))
      .filter(r => !isNaN(r.score) && r.score >= 0 && r.score <= 100);

    if (scoreRows.length === 0) {
      showSubmitStatus("No valid scores to submit.", "warning");
      return;
    }

    // ── Determine submission version ──
    // If resubmitting a rejected batch, increment version.
    const isResubmit  = existingSubmission && existingSubmission.status === "rejected";
    const newVersion  = isResubmit ? (existingSubmission.version + 1) : 1;

    let submissionId;

    if (!existingSubmission) {
      // ── First-time submission ──
      // Step 1: Create the submission record with status "pending"
      const sub = await createResultSubmission({
        lecturerId: lecturer.id,
        courseId:   selectedCourseId,
        session:    calendar.currentSession,
        semester:   Number(calendar.currentSemester),
        level:      selectedCourse.level,
        status:     "pending",
        submittedAt: new Date().toISOString(),
        reviewedBy:  null,
        reviewedAt:  null,
        rejectionReason: null,
        version:     1,
      });
      submissionId = sub.id;
      existingSubmission = sub;

      // Step 2: Create result rows linked to this submission
      await Promise.all(scoreRows.map(row =>
        createResult({
          studentId:    Number(row.studentId),
          courseId:     Number(selectedCourseId),
          session:      calendar.currentSession,
          semester:     Number(calendar.currentSemester),
          level:        Number(selectedCourse.level),
          score:        row.score,
          published:    false,         // NOT published yet — waits for admin approval
          submissionId: submissionId,
          uploadedBy:   lecturer.id,
        })
      ));
    } else {
      // ── Resubmit (rejected batch) ──
      submissionId = existingSubmission.id;

      // Step 1: Update / create result rows with new scores
      // published stays false until admin approves again
      await Promise.all(scoreRows.map(row => {
        if (row.resultId) {
          // Update existing result row score
          return updateResult(row.resultId, {
            score: row.score,
            published: false,
          });
        } else {
          // Create new row (student may not have had a record yet)
          return createResult({
            studentId:    Number(row.studentId),
            courseId:     Number(selectedCourseId),
            session:      calendar.currentSession,
            semester:     Number(calendar.currentSemester),
            level:        Number(selectedCourse.level),
            score:        row.score,
            published:    false,
            submissionId: submissionId,
            uploadedBy:   lecturer.id,
          });
        }
      }));

      // Step 2: Flip the submission back to "pending" with new version
      await updateResultSubmission(submissionId, {
        status:          "pending",
        submittedAt:     new Date().toISOString(),
        reviewedBy:      null,
        reviewedAt:      null,
        rejectionReason: null,
        version:         newVersion,
      });
    }

    submitConfirmModal.hide();
    showSubmitStatus("✓ Submitted for admin approval! This batch is now locked until reviewed.", "success");

    // Refresh submissions list so status notices update
    submissions = await getResultSubmissions({ lecturerId: lecturer.id });
    results     = await getResults();
    existingSubmission = submissions.find(
      s => String(s.courseId) === String(selectedCourseId) &&
           s.session           === calendar.currentSession &&
           Number(s.semester)  === Number(calendar.currentSemester)
    );
    renderStatusNotices();
    renderStudentTable();   // re-render to show locked state
  } catch (err) {
    console.error(err);
    showSubmitStatus("Something went wrong. Please try again.", "danger");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = `<i class="bi bi-send-fill"></i> Yes, Submit`;
  }
}

/* ── Sidebar ────────────────────────────────────────────── */
function setupSidebar() {
  const initials = (lecturer.name || "L").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("sidebarAvatarInitials").textContent = initials;
  document.getElementById("sidebarUserName").textContent       = lecturer.name || "Lecturer";
  document.getElementById("sidebarUserMeta").textContent       = lecturer.email;

  const toggle  = document.getElementById("sidebarToggleBtn");
  const sidebar = document.getElementById("appSidebar");
  const scrim   = document.getElementById("appSidebarScrim");
  toggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("is-open");
    scrim.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open);
  });
  scrim.addEventListener("click", () => {
    sidebar.classList.remove("is-open");
    scrim.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  });
}

function setupLogout() {
  const modal = new bootstrap.Modal(document.getElementById("logoutConfirmModal"));
  document.getElementById("logoutBtn").addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
    lecturerLogout();
    window.location.href = "/assets/pages/lecturer/lecturer-login.html";
  });
}

/* ── Helpers ────────────────────────────────────────────── */
function showSubmitStatus(msg, type = "info") {
  const el = document.getElementById("submitStatusMsg");
  const colorMap = {
    success: "var(--success)", warning: "var(--warn)", danger: "var(--danger)", info: "var(--ink-400)"
  };
  el.style.color = colorMap[type] || "var(--ink-400)";
  el.textContent = msg;
}
