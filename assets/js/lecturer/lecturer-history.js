import { requireLecturerAuth, getCurrentLecturer, lecturerLogout } from "../lecturerAuth.js";
import { getResultSubmissions, getCourses, getAcademicCalendar } from "../api.js";
import { renderHistory } from "../historyComponent.js";
import { initMobileSidebar } from "../sidebar.js";

requireLecturerAuth();

/* ─────────────────────────────────────────────────────────
   POLLING — re-fetch every 30 s so admin approve/reject
   actions are reflected without a hard reload.
   ───────────────────────────────────────────────────────── */
const POLL_INTERVAL_MS = 30_000;
let pollTimer  = null;
let refreshing = false;

/* ── State ──────────────────────────────────────────────── */
let lecturer    = null;
let submissions = [];   /* ONLY current session + semester — pre-filtered at load */
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

    /* Wire the only remaining filter: Status */
    document.getElementById("filterStatus").addEventListener("change", applyFilters);

    /* Stamp the locked period badge */
    const label = document.getElementById("currentPeriodLabel");
    if (label && calendar) {
      label.textContent = `${calendar.currentSession} · Semester ${calendar.currentSemester}`;
    }

    document.getElementById("pageLoading").classList.add("d-none");
    document.getElementById("pageContent").classList.remove("d-none");

    applyFilters();

    startPolling();
    bindVisibilityChange();
  } catch (err) {
    console.error(err);
    document.getElementById("pageLoading").innerHTML =
      `<div class="alert alert-danger mb-0">
         Failed to load history. <button class="btn btn-sm btn-danger ms-2" onclick="location.reload()">Retry</button>
       </div>`;
  }
}

/* ── Data load ───────────────────────────────────────────── */
/**
 * Fetches only the submissions for the CURRENT session + semester.
 * Filtering at fetch time (server-side query params) means the
 * in-memory `submissions` array never contains past-semester data,
 * so there is nothing to accidentally surface in the UI.
 */
async function loadData() {
  [courses, calendar] = await Promise.all([
    getCourses(),
    getAcademicCalendar(),
  ]);

  /* Fetch only current-semester submissions for this lecturer */
  submissions = await getResultSubmissions({
    lecturerId: Number(lecturer.id),
    session:    calendar.currentSession,
    semester:   Number(calendar.currentSemester),
  });

  submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

/* ── Polling ─────────────────────────────────────────────── */
async function refreshData() {
  if (refreshing) return;
  refreshing = true;

  try {
    const fresh = await getResultSubmissions({
      lecturerId: Number(lecturer.id),
      session:    calendar.currentSession,
      semester:   Number(calendar.currentSemester),
    });
    fresh.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    const changed = JSON.stringify(fresh) !== JSON.stringify(submissions);
    if (changed) {
      submissions = fresh;
      applyFilters();
    }
  } catch (err) {
    console.error("[History] refreshData failed:", err);
  } finally {
    refreshing = false;
  }
}

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

function bindVisibilityChange() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshData();
  });
}

/* ── Filter ──────────────────────────────────────────────── */
/**
 * Period (session + semester) is NOT a UI filter — it is permanently
 * locked to the current semester. Only status can be filtered.
 */
function applyFilters() {
  const status = document.getElementById("filterStatus").value;

  const filtered = submissions.filter(s => {
    const st = (s.status || "").toLowerCase().trim();
    return !status || st === status.toLowerCase();
  });

  renderTable(filtered);
}

/* ── Table ───────────────────────────────────────────────── */
function renderTable(rows) {
  const tbody = document.getElementById("historyTbody");
  const empty = document.getElementById("historyEmpty");

  if (rows.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("d-none");
    return;
  }
  empty.classList.add("d-none");

  tbody.innerHTML = rows.map(sub => {
    const course = courses.find(c => String(c.id) === String(sub.courseId));
    const date   = new Date(sub.submittedAt).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });

    const st = (sub.status || "").toLowerCase().trim();

    const badgeStyle = {
      pending:  "background:var(--warn-100);color:var(--warn);",
      approved: "background:var(--success-100);color:var(--success);",
      rejected: "background:var(--danger-100);color:var(--danger);",
    }[st] || "";

    const statusBadge = `<span class="status-badge" style="${badgeStyle}">${st}</span>`;

    const actionBtn = st === "rejected"
      ? `<a href="/assets/pages/lecturer/lecturer-upload.html?courseId=${sub.courseId}&resubmit=1"
             class="btn btn-sm"
             style="background:var(--danger-100);color:var(--danger);border:1px solid var(--danger);">
           <i class="bi bi-arrow-clockwise"></i> Resubmit
         </a>`
      : `<span class="text-muted small">—</span>`;

    return `<tr>
      <td class="fw-semibold">${course ? course.courseCode + " — " + course.courseTitle : "Unknown"}</td>
      <td>${sub.session}</td>
      <td>Sem ${sub.semester}</td>
      <td>${sub.level}</td>
      <td class="text-muted-cell">${date}</td>
      <td class="text-muted-cell">v${sub.version}</td>
      <td>${statusBadge}</td>
      <td style="max-width:200px;word-break:break-word;font-size:.82rem;">
        ${sub.rejectionReason
          ? `<span class="text-danger">${sub.rejectionReason}</span>`
          : "—"}
      </td>
      <td class="text-end">
        ${actionBtn}
        <button type="button"
                class="btn btn-sm btn-secondary-outline ms-1"
                data-action="history"
                data-id="${sub.id}"
                title="View audit trail">
          <i class="bi bi-clock-history"></i>
        </button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-action='history']").forEach(btn =>
    btn.addEventListener("click", () => openHistoryModal(btn.dataset.id))
  );
}

/* ── History modal ───────────────────────────────────────── */
function openHistoryModal(submissionId) {
  const modal = new bootstrap.Modal(document.getElementById("historyModal"));
  const body  = document.getElementById("historyModalBody");
  body.innerHTML = "";
  renderHistory(body, {
    entityType: "resultSubmission",
    entityId:   submissionId,
    title:      "Submission history",
  });
  modal.show();
  body.querySelector(".history-toggle")?.click();
}

/* ── Sidebar ─────────────────────────────────────────────── */
function setupSidebar() {
  const initials = (lecturer.name || "L").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("sidebarAvatarInitials").textContent = initials;
  document.getElementById("sidebarUserName").textContent       = lecturer.name || "Lecturer";
  document.getElementById("sidebarUserMeta").textContent       = lecturer.email;
  initMobileSidebar();
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
