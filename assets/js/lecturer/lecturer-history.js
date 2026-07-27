import { requireLecturerAuth, getCurrentLecturer, lecturerLogout } from "../lecturerAuth.js";
import { getResultSubmissions, getCourses } from "../api.js";

requireLecturerAuth();

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
  } catch (err) {
    console.error(err);
    document.getElementById("pageLoading").innerHTML =
      `<div class="alert alert-danger mb-0">Failed to load history.</div>`;
  }
}

/* ── Data ───────────────────────────────────────────────── */
async function loadData() {
  [submissions, courses] = await Promise.all([
    getResultSubmissions({ lecturerId: lecturer.id }),
    getCourses(),
  ]);
  // Newest first
  submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

/* ── Session filter options ─────────────────────────────── */
function buildSessionFilter() {
  const sessions = [...new Set(submissions.map(s => s.session))].sort().reverse();
  const sel = document.getElementById("filterSession");
  sel.innerHTML = `<option value="">All Sessions</option>` +
    sessions.map(s => `<option value="${s}">${s}</option>`).join("");
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
    const statusOk   = !status   || s.status === status;
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
    const course  = courses.find(c => String(c.id) === String(sub.courseId));
    const date    = new Date(sub.submittedAt).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric"
    });

    // Status badge styling
    const badgeStyle = {
      pending:  "background:var(--warn-100);color:var(--warn);",
      approved: "background:var(--success-100);color:var(--success);",
      rejected: "background:var(--danger-100);color:var(--danger);",
    }[sub.status] || "";

    const statusBadge = `<span class="status-badge" style="${badgeStyle}">${sub.status}</span>`;

    // Resubmit button — only for rejected batches
    const actionBtn = sub.status === "rejected"
      ? `<a href="/assets/pages/lecturer/lecturer-upload.html?courseId=${sub.courseId}&resubmit=1"
             class="btn btn-sm" style="background:var(--danger-100);color:var(--danger);border:1px solid var(--danger);">
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
        ${sub.rejectionReason ? `<span class="text-danger">${sub.rejectionReason}</span>` : "—"}
      </td>
      <td class="text-end">${actionBtn}</td>
    </tr>`;
  }).join("");
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
