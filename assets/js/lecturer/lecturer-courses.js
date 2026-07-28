import { requireLecturerAuth, getCurrentLecturer, lecturerLogout } from "../lecturerAuth.js";
import {
  getCourseAssignments, getCourses, getAcademicCalendar,
  getRegistrations, getResultSubmissions,
} from "../api.js";

requireLecturerAuth();

/* ── State ──────────────────────────────────────────────── */
let lecturer    = null;
let assignments = [];
let courses     = [];
let calendar    = null;
let registrations = [];
let submissions = [];

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
    await loadData();

    document.getElementById("pageLoading").classList.add("d-none");
    document.getElementById("pageContent").classList.remove("d-none");

    renderCalendarBanner();
    renderCourses();
  } catch (err) {
    console.error(err);
    document.getElementById("pageLoading").innerHTML =
      `<div class="alert alert-danger mb-0">Failed to load courses. Please refresh.</div>`;
  }
}

/* ── Data ───────────────────────────────────────────────── */
async function loadData() {
  [assignments, courses, calendar, registrations, submissions] = await Promise.all([
    getCourseAssignments({ lecturerId: Number(lecturer.id) }),
    getCourses(),
    getAcademicCalendar(),
    getRegistrations(),
    getResultSubmissions({ lecturerId: Number(lecturer.id) }),
  ]);
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

/* ── Calendar banner ────────────────────────────────────── */
function renderCalendarBanner() {
  document.getElementById("calendarLabel").textContent =
    `${calendar.currentSession} — Semester ${calendar.currentSemester}`;
}

/* ── Course cards ────────────────────────────────────────── */
function renderCourses() {
  // Only show assignments for the CURRENT session/semester (from academicCalendar)
  const currAssignments = assignments.filter(
    a => a.session === calendar.currentSession &&
         Number(a.semester) === Number(calendar.currentSemester)
  );

  const grid  = document.getElementById("coursesGrid");
  const empty = document.getElementById("coursesEmpty");

  if (currAssignments.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("d-none");
    return;
  }
  empty.classList.add("d-none");

  grid.innerHTML = currAssignments.map(assignment => {
    const course = courses.find(c => String(c.id) === String(assignment.courseId));
    if (!course) return "";

    // Count registered students for this course / session / semester
    const studentCount = registrations.filter(r =>
      String(r.courseId) === String(course.id) &&
      r.session           === calendar.currentSession &&
      Number(r.semester)  === Number(calendar.currentSemester)
    ).length;

    // Check if a submission already exists for this assignment
    const sub = submissions.find(s =>
      String(s.courseId) === String(course.id) &&
      s.session           === calendar.currentSession &&
      Number(s.semester)  === Number(calendar.currentSemester)
    );

    // Decide button label and state based on existing submission
    let btnHtml;
    if (!sub) {
      btnHtml = `<a href="/assets/pages/lecturer/lecturer-upload.html?courseId=${course.id}"
                    class="btn btn-brand btn-sm w-100">
                   <i class="bi bi-cloud-upload"></i> Upload Results
                 </a>`;
    } else if (sub.status === "pending") {
      btnHtml = `<button class="btn btn-secondary-outline btn-sm w-100" disabled>
                   <i class="bi bi-hourglass-split"></i> Pending Approval
                 </button>`;
    } else if (sub.status === "approved") {
      btnHtml = `<button class="btn btn-sm w-100" style="background:var(--success-100);color:var(--success);border:none;" disabled>
                   <i class="bi bi-check-circle-fill"></i> Approved &amp; Published
                 </button>`;
    } else if (sub.status === "rejected") {
      btnHtml = `<a href="/assets/pages/lecturer/lecturer-upload.html?courseId=${course.id}&resubmit=1"
                    class="btn btn-sm w-100" style="background:var(--danger-100);color:var(--danger);border:1px solid var(--danger);">
                   <i class="bi bi-arrow-clockwise"></i> Resubmit Results
                 </a>`;
    }

    const statusBadge = sub
      ? `<span class="status-badge status-badge--${sub.status === "approved" ? "completed" : sub.status === "rejected" ? "danger" : "pending"}"
               style="${sub.status === "rejected" ? "background:var(--danger-100);color:var(--danger);" : ""}">${sub.status}</span>`
      : `<span class="status-badge status-badge--pending">Not submitted</span>`;

    return `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="card-surface h-100 d-flex flex-column gap-3">
          <!-- Course header -->
          <div class="d-flex align-items-start gap-3">
            <div class="lecturer-course-icon">
              <i class="bi bi-journal-text"></i>
            </div>
            <div class="flex-grow-1 min-width-0">
              <div class="fw-bold" style="font-family:var(--font-display);font-size:.95rem;">${course.courseCode}</div>
              <div style="font-size:.88rem;color:var(--ink-700);line-height:1.3;">${course.courseTitle}</div>
            </div>
            ${statusBadge}
          </div>

          <!-- Course meta -->
          <div class="d-flex gap-3 flex-wrap" style="font-size:.82rem;color:var(--ink-400);">
            <span><i class="bi bi-layers me-1"></i>${course.level} Level</span>
            <span><i class="bi bi-clock me-1"></i>Sem ${course.semester}</span>
            <span><i class="bi bi-award me-1"></i>${course.creditUnit} cr</span>
            <span><i class="bi bi-people me-1"></i>${studentCount} student${studentCount === 1 ? "" : "s"}</span>
          </div>

          <!-- Action button -->
          <div class="mt-auto">${btnHtml}</div>
        </div>
      </div>`;
  }).join("");
}
