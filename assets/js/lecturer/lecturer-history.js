import { requireLecturerAuth, getCurrentLecturer, lecturerLogout } from "../lecturerAuth.js";
import { getResultSubmissions, getCourses } from "../api.js";
import { renderHistory } from "../historyComponent.js";

requireLecturerAuth();

/* ─────────────────────────────────────────────────────────
   POLLING
   BUG 7 FIX — the history table previously had no mechanism
   to detect admin approve / reject actions.  The only way to
   see an updated status badge was a full hard-reload.

   Fix: poll every 30 s and re-fetch submissions. The timer
   is skipped while the tab is hidden and cleared on unload.
   ───────────────────────────────────────────────────────── */
const POLL_INTERVAL_MS = 30_000;
let pollTimer  = null;
let refreshing = false;

/* ── State ──────────────────────────────────────────────── */
let lecturer    = null;
let submissions = [];
let courses     = [];
let filtered    = [];

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

    buildSessionFilter();
    bindFilters();

    document.getElementById("pageLoading").classList.add("d-none");
    document.getElementById("pageContent").classList.remove("d-none");

    applyFilters();

    /* BUG 7 FIX — start live refresh mechanisms */
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

/* ── Full data load (cold start) ────────────────────────── */
async function loadData() {
  [submissions, courses] = await Promise.all([
    getResultSubmissions({ lecturerId: Number(lecturer.id) }),
    getCourses(),
  ]);
  submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

/* ── Lightweight refresh (polling / visibility target) ──────
   Only re-fetches submissions — courses never change at
   runtime. Preserves the active filter selections and
   re-renders the table in-place without a page flicker.
   ───────────────────────────────────────────────────────── */
async function refreshData() {
  if (refreshing) return;
  refreshing = true;

  try {
    const fresh = await getResultSubmissions({ lecturerId: Number(lecturer.id) });
    fresh.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    /* Only re-render if something actually changed — avoids
       unnecessary DOM churn on every 30 s tick.            */
    const changed = JSON.stringify(fresh) !== JSON.stringify(submissions);
    if (changed) {
      submissions = fresh;
      /* Rebuild the session dropdown in case a new submission
         appeared in a session that wasn't listed before.    */
      buildSessionFilter();
      applyFilters();   // honours current filter values
    }
  } catch (err) {
    console.error("[History] refreshData failed:", err);
    /* Silent — don't disrupt the UI for a transient error.
       The next poll tick will retry automatically.          */
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

/* ── Session filter options ─────────────────────────────── */
function buildSessionFilter() {
  const sel          = document.getElementById("filterSession");
  const currentValue = sel.value;   // preserve selection across rebuilds

  const sessions = [...new Set(submissions.map(s => s.session))].sort().reverse();
  sel.innerHTML  = `<option value="">All Sessions</option>` +
    sessions.map(s => `<option value="${s}"${s === currentValue ? " selected" : ""}>${s}</option>`).join("");
}

/* ── Filters ────────────────────────────────────────────── */
function bindFilters() {
  ["filterStatus", "filterSession", "filterSemester"].forEach(id =>
    document.getElementById(id).addEventListener("change", applyFilters)
  );
}

function applyFilters() {
  const status   = document.getElementById("filterStatus").value;
  const session  = document.getElementById("filterSession").value;
  const semester = document.getElementById("filterSemester").value;

  filtered = submissions.filter(s => {
    const st = (s.status || "").toLowerCase().trim();
    const statusOk   = !status   || st === status.toLowerCase();
    const sessionOk  = !session  || s.session === session;
    const semesterOk = !semester || Number(s.semester) === Number(semester);
    return statusOk && sessionOk && semesterOk;
  });

  renderTable();
}

/* ── Table ──────────────────────────────────────────────── */
function renderTable() {
  const tbody = document.getElementById("historyTbody");
  const empty = document.getElementById("historyEmpty");

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("d-none");
    return;
  }
  empty.classList.add("d-none");

  tbody.innerHTML = filtered.map(sub => {
    const course = courses.find(c => String(c.id) === String(sub.courseId));
    const date   = new Date(sub.submittedAt).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });

    /* Normalise to lowercase so comparisons are case-insensitive */
    const st = (sub.status || "").toLowerCase().trim();

    const badgeStyle = {
      pending:  "background:var(--warn-100);color:var(--warn);",
      approved: "background:var(--success-100);color:var(--success);",
      rejected: "background:var(--danger-100);color:var(--danger);",
    }[st] || "";

    const statusBadge = `<span class="status-badge" style="${badgeStyle}">${st}</span>`;

    /*
     * BUG 8 FIX (history side) — the Resubmit link already carried
     * ?resubmit=1, but lecturer-upload.js was ignoring the param.
     * That is now fixed in lecturer-upload.js.  We keep the param
     * here so the upload page can show the rejection context banner.
     */
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

/* ── History modal ──────────────────────────────────────── */
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
