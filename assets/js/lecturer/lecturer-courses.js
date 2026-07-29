import { requireLecturerAuth, getCurrentLecturer, lecturerLogout } from "../lecturerAuth.js";
import {
  getCourseAssignments, getCourses, getAcademicCalendar,
  getRegistrations, getResultSubmissions,
} from "../api.js";

requireLecturerAuth();

/* ─────────────────────────────────────────────────────────
   POLLING
   Re-fetches only submissions (the only thing whose status
   changes at runtime) every 30 seconds so card buttons
   reflect admin approve / reject actions without a hard
   reload. The timer is stopped on beforeunload.
   ───────────────────────────────────────────────────────── */
const POLL_INTERVAL_MS = 30_000;
let pollTimer  = null;
let refreshing = false;

/* ── State ──────────────────────────────────────────────── */
let lecturer      = null;
let assignments   = [];
let courses       = [];
let calendar      = null;
let registrations = [];   // filtered to current session/semester only — BUG 6 FIX
let submissions   = [];

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

    /* BUG 5 FIX — start polling and visibility listener after
       first render so admin actions are reflected live.         */
    startPolling();
    bindVisibilityChange();
  } catch (err) {
    console.error(err);
    document.getElementById("pageLoading").innerHTML =
      `<div class="alert alert-danger mb-0">
         Failed to load courses. <button class="btn btn-sm btn-danger ms-2" onclick="location.reload()">Retry</button>
       </div>`;
  }
}

/* ── Data loading ───────────────────────────────────────────
   BUG 6 FIX — registrations are fetched with explicit
   session + semester filters so studentCount only counts
   students enrolled in the *current* term, not across all
   historical semesters for the same course code.
   ───────────────────────────────────────────────────────── */
async function loadData() {
  /* Fetch calendar first so we can use it as a filter key
     for the registrations request.                          */
  calendar = await getAcademicCalendar();

  [assignments, courses, registrations, submissions] = await Promise.all([
    getCourseAssignments({ lecturerId: Number(lecturer.id) }),
    getCourses(),
    /* BUG 6 FIX — pass session + semester so json-server
       returns only registrations for the active term.       */
    getRegistrations({
      session:  calendar.currentSession,
      semester: Number(calendar.currentSemester),
    }),
    getResultSubmissions({ lecturerId: Number(lecturer.id) }),
  ]);
}

/* ── Lightweight refresh (polling target) ──────────────────
   BUG 5 FIX — only re-fetches the two things that change at
   runtime: submissions and the current-term registrations.
   Courses, assignments, and calendar are stable.
   ───────────────────────────────────────────────────────── */
async function refreshData() {
  if (refreshing) return;
  refreshing = true;

  try {
    [registrations, submissions] = await Promise.all([
      getRegistrations({
        session:  calendar.currentSession,
        semester: Number(calendar.currentSemester),
      }),
      getResultSubmissions({ lecturerId: Number(lecturer.id) }),
    ]);
    renderCourses();
  } catch (err) {
    console.error("[Courses] refreshData failed:", err);
  } finally {
    refreshing = false;
  }
}

/* ── Polling ────────────────────────────────────────────── */
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (document.visibilityState !== "hidden") refreshData();
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

window.addEventListener("beforeunload", stopPolling);

/* ── Page Visibility API ────────────────────────────────── */
function bindVisibilityChange() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshData();
  });
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
    stopPolling();
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

    /*
     * BUG 6 FIX — registrations array is already pre-filtered to
     * the current session/semester (done at fetch time), so this
     * filter only needs to match on courseId.  No more double-
     * counting across historical semesters.
     */
    const studentCount = registrations.filter(r =>
      String(r.courseId) === String(course.id)
    ).length;

    const sub = submissions.find(s =>
      String(s.courseId) === String(course.id) &&
      s.session           === calendar.currentSession &&
      Number(s.semester)  === Number(calendar.currentSemester)
    );

    /* Normalise status to lower-case so "Pending" === "pending" */
    const st = sub ? (sub.status || "").toLowerCase().trim() : null;

    let btnHtml;
    if (!st) {
      btnHtml = `
        <a href="/assets/pages/lecturer/lecturer-upload.html?courseId=${course.id}"
           class="btn btn-brand btn-sm w-100">
          <i class="bi bi-cloud-upload"></i> Upload Results
        </a>`;
    } else if (st === "pending") {
      btnHtml = `
        <button class="btn btn-secondary-outline btn-sm w-100" disabled>
          <i class="bi bi-hourglass-split"></i> Pending Approval
        </button>`;
    } else if (st === "approved") {
      btnHtml = `
        <button class="btn btn-sm w-100"
                style="background:var(--success-100);color:var(--success);border:none;" disabled>
          <i class="bi bi-check-circle-fill"></i> Approved &amp; Published
        </button>`;
    } else if (st === "rejected") {
      btnHtml = `
        <a href="/assets/pages/lecturer/lecturer-upload.html?courseId=${course.id}&resubmit=1"
           class="btn btn-sm w-100"
           style="background:var(--danger-100);color:var(--danger);border:1px solid var(--danger);">
          <i class="bi bi-arrow-clockwise"></i> Resubmit Results
        </a>`;
    }

    const badgeVariant = {
      pending:  "pending",
      approved: "completed",
      rejected: "danger",
    }[st] || "pending";

    const badgeStyle = st === "rejected"
      ? `style="background:var(--danger-100);color:var(--danger);"`
      : "";

    const statusBadge = sub
      ? `<span class="status-badge status-badge--${badgeVariant}" ${badgeStyle}>${st}</span>`
      : `<span class="status-badge status-badge--pending">Not submitted</span>`;

    return `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="card-surface h-100 d-flex flex-column gap-3">
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

          <div class="d-flex gap-3 flex-wrap" style="font-size:.82rem;color:var(--ink-400);">
            <span><i class="bi bi-layers me-1"></i>${course.level} Level</span>
            <span><i class="bi bi-clock me-1"></i>Sem ${course.semester}</span>
            <span><i class="bi bi-award me-1"></i>${course.creditUnit} cr</span>
            <span><i class="bi bi-people me-1"></i>${studentCount} student${studentCount === 1 ? "" : "s"}</span>
          </div>

          ${sub?.rejectionReason && st === "rejected" ? `
          <div class="small" style="color:var(--danger);background:var(--danger-100);border-radius:6px;padding:.5rem .75rem;">
            <i class="bi bi-exclamation-circle me-1"></i>${sub.rejectionReason}
          </div>` : ""}

          <div class="mt-auto">${btnHtml}</div>
        </div>
      </div>`;
  }).join("");
}
