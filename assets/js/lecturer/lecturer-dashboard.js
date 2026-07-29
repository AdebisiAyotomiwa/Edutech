import { requireLecturerAuth, getCurrentLecturer, lecturerLogout } from "../lecturerAuth.js";
import {
  getCourseAssignments, getResultSubmissions,
  getCourses, getAcademicCalendar,
} from "../api.js";

requireLecturerAuth();

/* ─────────────────────────────────────────────────────────
   POLLING INTERVAL
   The dashboard re-fetches submissions every 30 seconds so
   that admin approve/reject actions are reflected without a
   manual hard-refresh. The interval is cleared when the page
   unloads to avoid stale requests leaking into other sessions.
   ───────────────────────────────────────────────────────── */
const POLL_INTERVAL_MS = 30_000;
let pollTimer = null;

/* ── State ──────────────────────────────────────────────── */
let lecturer    = null;
let assignments = [];
let submissions = [];
let courses     = [];
let calendar    = null;

/* Track whether a refresh is already in flight so the
   polling timer and the manual button don't overlap.     */
let refreshing = false;

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
    bindRefreshButton();

    await loadData();   // initial full load (includes courses + calendar)

    document.getElementById("pageLoading").classList.add("d-none");
    document.getElementById("pageContent").classList.remove("d-none");

    renderGreeting();
    renderStatCards();
    renderRecentSubmissions();
    stampLastUpdated();

    startPolling();
    bindVisibilityChange();
  } catch (err) {
    console.error("[Dashboard] init failed:", err);
    document.getElementById("pageLoading").innerHTML =
      `<div class="alert alert-danger mb-0">
         <i class="bi bi-exclamation-triangle-fill me-2"></i>
         Failed to load dashboard. <button class="btn btn-sm btn-danger ms-2" onclick="location.reload()">Retry</button>
       </div>`;
  }
}

/* ─────────────────────────────────────────────────────────
   DATA LOADING
   loadData()       — cold start: fetches everything
   refreshData()    — hot refresh: re-fetches only the two
                      things that change at runtime
                      (submissions + assignments)
   ───────────────────────────────────────────────────────── */
async function loadData() {
  [assignments, submissions, courses, calendar] = await Promise.all([
    getCourseAssignments({ lecturerId: Number(lecturer.id) }),
    getResultSubmissions({ lecturerId: Number(lecturer.id) }),
    getCourses(),
    getAcademicCalendar(),
  ]);
}

/**
 * Lightweight re-fetch — only hits the two endpoints whose
 * data changes at runtime. Courses and calendar are stable
 * and are not re-fetched on every poll.
 *
 * Returns true if the UI was updated, false on error.
 */
async function refreshData() {
  if (refreshing) return false;
  refreshing = true;
  setRefreshSpinner(true);

  try {
    [assignments, submissions] = await Promise.all([
      getCourseAssignments({ lecturerId: Number(lecturer.id) }),
      getResultSubmissions({ lecturerId: Number(lecturer.id) }),
    ]);

    renderStatCards();
    renderRecentSubmissions();
    stampLastUpdated();
    hideDashboardError();
    return true;
  } catch (err) {
    console.error("[Dashboard] refreshData failed:", err);
    showDashboardError("Could not fetch latest data. Will retry automatically.");
    return false;
  } finally {
    refreshing = false;
    setRefreshSpinner(false);
  }
}

/* ─────────────────────────────────────────────────────────
   POLLING
   A setInterval that calls refreshData() every 30 s.
   Cleared on beforeunload so there are no dangling timers
   when the lecturer navigates away.
   ───────────────────────────────────────────────────────── */
function startPolling() {
  stopPolling();   // guard against double-start
  pollTimer = setInterval(() => {
    /* Skip the poll if the tab is not visible — saves bandwidth
       and avoids noisy network errors when the device is asleep */
    if (document.visibilityState !== "hidden") {
      refreshData();
    }
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/* Clear the timer when the user leaves the page */
window.addEventListener("beforeunload", stopPolling);

/* ─────────────────────────────────────────────────────────
   PAGE VISIBILITY API
   When the lecturer switches away and comes back (alt-tab,
   phone lock/unlock, switching browser tabs) — fire an
   immediate refresh so they always see the latest status.
   ───────────────────────────────────────────────────────── */
function bindVisibilityChange() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshData();
    }
  });
}

/* ─────────────────────────────────────────────────────────
   MANUAL REFRESH BUTTON
   ───────────────────────────────────────────────────────── */
function bindRefreshButton() {
  const btn = document.getElementById("refreshBtn");
  if (!btn) return;
  btn.addEventListener("click", () => refreshData());

  const dismissBtn = document.getElementById("dismissErrorBtn");
  if (dismissBtn) dismissBtn.addEventListener("click", hideDashboardError);
}

function setRefreshSpinner(active) {
  const icon  = document.getElementById("refreshIcon");
  const label = document.getElementById("refreshLabel");
  const btn   = document.getElementById("refreshBtn");
  if (!icon) return;
  if (active) {
    icon.className = "bi bi-arrow-clockwise spin-once";
    if (label) label.textContent = "Refreshing…";
    if (btn)   btn.disabled = true;
  } else {
    icon.className = "bi bi-arrow-clockwise";
    if (label) label.textContent = "Refresh";
    if (btn)   btn.disabled = false;
  }
}

/* ── Last-updated timestamp ─────────────────────────────── */
function stampLastUpdated() {
  const el = document.getElementById("lastUpdatedLabel");
  if (!el) return;
  const now = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  el.textContent = `Last updated: ${now}`;
}

/* ─────────────────────────────────────────────────────────
   ERROR BANNER
   ───────────────────────────────────────────────────────── */
function showDashboardError(msg) {
  const banner = document.getElementById("dashboardError");
  const msgEl  = document.getElementById("dashboardErrorMsg");
  if (!banner) return;
  if (msgEl) msgEl.textContent = msg;
  banner.classList.remove("d-none");
}

function hideDashboardError() {
  const banner = document.getElementById("dashboardError");
  if (banner) banner.classList.add("d-none");
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
    stopPolling();   // stop polling before navigating away
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

/* ─────────────────────────────────────────────────────────
   STAT CARDS
   Status values are compared in lower-case to guard against
   any future casing inconsistency in the database
   (e.g. "Pending" vs "pending").
   ───────────────────────────────────────────────────────── */
function renderStatCards() {
  const currAssignments = assignments.filter(
    a => a.session === calendar.currentSession &&
         Number(a.semester) === Number(calendar.currentSemester)
  );

  const normalize = s => (s || "").toLowerCase().trim();

  const pendingCount  = submissions.filter(s => normalize(s.status) === "pending").length;
  const approvedCount = submissions.filter(s => normalize(s.status) === "approved").length;
  const rejectedCount = submissions.filter(s => normalize(s.status) === "rejected").length;

  document.getElementById("statAssigned").textContent = currAssignments.length;
  document.getElementById("statPending").textContent  = pendingCount;
  document.getElementById("statApproved").textContent = approvedCount;
  document.getElementById("statRejected").textContent = rejectedCount;
}

/* ─────────────────────────────────────────────────────────
   RECENT SUBMISSIONS LIST
   ───────────────────────────────────────────────────────── */
function renderRecentSubmissions() {
  const list = document.getElementById("recentSubmissionsList");

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

  const statusIcon = {
    pending:  "bi-hourglass-split",
    approved: "bi-check-circle-fill",
    rejected: "bi-x-circle-fill",
  };
  const iconColor = {
    pending:  "activity-icon--amber",
    approved: "activity-icon--green",
    rejected: "activity-icon--red",
  };
  const statusText = {
    pending:  "Pending approval",
    approved: "Approved ✓",
    rejected: "Rejected — needs resubmission",
  };

  list.innerHTML = recent.map(sub => {
    const course  = courses.find(c => String(c.id) === String(sub.courseId));
    const st      = (sub.status || "").toLowerCase().trim();
    const date    = new Date(sub.submittedAt).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });

    return `<div class="activity-item">
      <div class="activity-icon ${iconColor[st] || "activity-icon--amber"}">
        <i class="bi ${statusIcon[st] || "bi-circle"}"></i>
      </div>
      <div class="activity-body">
        <div class="activity-title">${course ? course.courseCode + " — " + course.courseTitle : "Unknown Course"}</div>
        <div class="activity-meta">${sub.session} · Sem ${sub.semester} · v${sub.version} · ${date}</div>
        ${st === "rejected" && sub.rejectionReason
          ? `<div class="activity-meta text-danger mt-1"><i class="bi bi-exclamation-circle me-1"></i>${sub.rejectionReason}</div>`
          : ""}
      </div>
      <span class="activity-badge" style="background:${badgeBg(st)};color:${badgeColor(st)};">
        ${statusText[st] || sub.status}
      </span>
    </div>`;
  }).join("");
}

/* ── Helpers ─────────────────────────────────────────────── */
function badgeBg(status) {
  return { pending: "var(--warn-100)", approved: "var(--success-100)", rejected: "var(--danger-100)" }[status]
    || "var(--paper-100)";
}
function badgeColor(status) {
  return { pending: "var(--warn)", approved: "var(--success)", rejected: "var(--danger)" }[status]
    || "var(--ink-400)";
}
