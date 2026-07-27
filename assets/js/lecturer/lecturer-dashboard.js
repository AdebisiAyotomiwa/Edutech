import { requireLecturerAuth, getCurrentLecturer, lecturerLogout } from "../lecturerAuth.js";
import {
  getCourseAssignments, getResultSubmissions,
  getCourses, getAcademicCalendar, getRegistrations,
} from "../api.js";

requireLecturerAuth();

/* ── State ──────────────────────────────────────────────── */
let lecturer    = null;
let assignments = [];   // courseAssignments for this lecturer
let submissions = [];   // resultSubmissions for this lecturer
let courses     = [];
let calendar    = null;

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

    renderGreeting();
    renderStatCards();
    renderRecentSubmissions();
  } catch (err) {
    console.error(err);
    document.getElementById("pageLoading").innerHTML =
      `<div class="alert alert-danger mb-0">Failed to load dashboard. Please refresh.</div>`;
  }
}

/* ── Data ───────────────────────────────────────────────── */
async function loadData() {
  [assignments, submissions, courses, calendar] = await Promise.all([
    getCourseAssignments({ lecturerId: lecturer.id }),
    getResultSubmissions({ lecturerId: lecturer.id }),
    getCourses(),
    getAcademicCalendar(),
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

/* ── Greeting ───────────────────────────────────────────── */
function renderGreeting() {
  const firstName = (lecturer.name || "Lecturer").split(" ")[0];
  document.getElementById("greetingHeading").textContent = `Welcome back, ${firstName} 👋`;
  document.getElementById("greetingSubtitle").textContent =
    `${calendar.currentSession} — Semester ${calendar.currentSemester}`;
}

/* ── Stat cards ──────────────────────────────────────────── */
function renderStatCards() {
  // Only count assignments for the current session/semester
  const currAssignments = assignments.filter(
    a => a.session === calendar.currentSession &&
         Number(a.semester) === Number(calendar.currentSemester)
  );

  const pendingCount  = submissions.filter(s => s.status === "pending").length;
  const approvedCount = submissions.filter(s => s.status === "approved").length;
  const rejectedCount = submissions.filter(s => s.status === "rejected").length;

  document.getElementById("statAssigned").textContent = currAssignments.length;
  document.getElementById("statPending").textContent  = pendingCount;
  document.getElementById("statApproved").textContent = approvedCount;
  document.getElementById("statRejected").textContent = rejectedCount;
}

/* ── Recent submissions list ─────────────────────────────── */
function renderRecentSubmissions() {
  const list = document.getElementById("recentSubmissionsList");

  // Show last 5 submissions, newest first
  const recent = [...submissions]
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .slice(0, 5);

  if (recent.length === 0) {
    list.innerHTML = `
      <div class="activity-item">
        <div class="activity-icon activity-icon--amber"><i class="bi bi-inbox"></i></div>
        <div class="activity-body">
          <div class="activity-title">No submissions yet</div>
          <div class="activity-meta">Upload results for an assigned course to get started.</div>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = recent.map(sub => {
    const course     = courses.find(c => String(c.id) === String(sub.courseId));
    const statusIcon = { pending: "bi-hourglass-split", approved: "bi-check-circle-fill", rejected: "bi-x-circle-fill" };
    const iconColor  = { pending: "activity-icon--amber", approved: "activity-icon--green", rejected: "activity-icon--red" };
    const statusText = { pending: "Pending approval", approved: "Approved ✓", rejected: "Rejected — needs resubmission" };
    const date = new Date(sub.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

    return `<div class="activity-item">
      <div class="activity-icon ${iconColor[sub.status] || "activity-icon--amber"}">
        <i class="bi ${statusIcon[sub.status] || "bi-circle"}"></i>
      </div>
      <div class="activity-body">
        <div class="activity-title">${course ? course.courseCode + " — " + course.courseTitle : "Unknown Course"}</div>
        <div class="activity-meta">${sub.session} · Sem ${sub.semester} · v${sub.version} · ${date}</div>
        ${sub.status === "rejected" && sub.rejectionReason ? `<div class="activity-meta text-danger mt-1"><i class="bi bi-exclamation-circle me-1"></i>${sub.rejectionReason}</div>` : ""}
      </div>
      <span class="activity-badge" style="background:${badgeBg(sub.status)};color:${badgeColor(sub.status)};">
        ${statusText[sub.status] || sub.status}
      </span>
    </div>`;
  }).join("");
}

/* ── Helpers ─────────────────────────────────────────────── */
function badgeBg(status) {
  return { pending: "var(--warn-100)", approved: "var(--success-100)", rejected: "var(--danger-100)" }[status] || "var(--paper-100)";
}
function badgeColor(status) {
  return { pending: "var(--warn)", approved: "var(--success)", rejected: "var(--danger)" }[status] || "var(--ink-400)";
}
