import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import {
  getResultSubmissions, getCourses, getLecturers,
  getResults, getStudents,
  approveSubmission, rejectSubmission,
} from "../api.js";
import { scoreToGrade } from "../utils.js";

requireAdminAuth();

/* ── State ──────────────────────────────────────────────── */
let admin       = null;
let submissions = [];
let courses     = [];
let lecturers   = [];
let students    = [];
let results     = [];
let filtered    = [];

/* Currently open detail */
let openSubmissionId = null;

/* ── DOM refs ───────────────────────────────────────────── */
const pageState        = document.getElementById("pageState");
const pageContent      = document.getElementById("pageContent");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar       = document.getElementById("appSidebar");
const appSidebarScrim  = document.getElementById("appSidebarScrim");
const logoutBtn        = document.getElementById("logoutBtn");

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    admin = getCurrentAdmin();
    if (!admin) { window.location.href = "/assets/pages/admin/admin-login.html"; return; }

    setupSidebar();
    setupLogout();
    await loadData();

    buildSessionFilter();
    bindFilters();
    bindTabs();
    renderMetrics();

    pageState.classList.add("d-none");
    pageContent.classList.remove("d-none");

    applyFilters(); // default = show pending
  } catch (err) {
    console.error(err);
    pageState.innerHTML = `<div class="alert alert-danger mb-0">Failed to load approvals.</div>`;
  }
}

/* ── Data ───────────────────────────────────────────────── */
async function loadData() {
  [submissions, courses, lecturers, students, results] = await Promise.all([
    getResultSubmissions(),
    getCourses(),
    getLecturers(),
    getStudents(),
    getResults(),
  ]);
  submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

/* ── Sidebar ────────────────────────────────────────────── */
function setupSidebar() {
  const initials = (admin.name || "A").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("sidebarAvatarInitials").textContent = initials;
  document.getElementById("sidebarUserName").textContent       = admin.name || "Admin";
  document.getElementById("sidebarUserMeta").textContent       = admin.email;

  const pendingCount = submissions.filter(s => s.status === "pending").length;
  const badge = document.getElementById("sidebarPendingBadge");
  if (pendingCount > 0) { badge.textContent = pendingCount; badge.style.display = ""; }

  sidebarToggleBtn.addEventListener("click", () => {
    const open = appSidebar.classList.toggle("is-open");
    appSidebarScrim.classList.toggle("is-open");
    sidebarToggleBtn.setAttribute("aria-expanded", open);
  });
  appSidebarScrim.addEventListener("click", () => {
    appSidebar.classList.remove("is-open");
    appSidebarScrim.classList.remove("is-open");
    sidebarToggleBtn.setAttribute("aria-expanded", "false");
  });
}

function setupLogout() {
  const modal = new bootstrap.Modal(document.getElementById("logoutConfirmModal"));
  logoutBtn.addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
    adminLogout(); window.location.href = "/assets/pages/admin/admin-login.html";
  });
}

/* ── Tabs ───────────────────────────────────────────────── */
function bindTabs() {
  document.getElementById("approvalsTabs").querySelectorAll(".nav-link").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("approvalsTabs").querySelectorAll(".nav-link").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("queueTab").classList.toggle("d-none", tab !== "queue");
      document.getElementById("logTab").classList.toggle("d-none",   tab !== "log");
      if (tab === "log") buildLogFilters(), renderLog();
    });
  });
}

/* ── Metrics ────────────────────────────────────────────── */
function renderMetrics() {
  document.getElementById("mPending").textContent  = submissions.filter(s => s.status === "pending").length;
  document.getElementById("mApproved").textContent = submissions.filter(s => s.status === "approved").length;
  document.getElementById("mRejected").textContent = submissions.filter(s => s.status === "rejected").length;
}

/* ── Session filter ──────────────────────────────────────── */
function buildSessionFilter() {
  const sessions = [...new Set(submissions.map(s => s.session))].sort().reverse();
  const sel = document.getElementById("filterSession");
  sel.innerHTML = `<option value="">All Sessions</option>` +
    sessions.map(s => `<option value="${s}">${s}</option>`).join("");
}

/* ── Queue filters ───────────────────────────────────────── */
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

  renderQueue();
  document.getElementById("detailPanel").classList.add("d-none");
  document.getElementById("queuePanel").classList.remove("d-none");
}

/* ── Lecturer name helper (no title prefix) ──────────────── */
function lecturerName(id) {
  const l = lecturers.find(l => String(l.id) === String(id));
  return l ? l.name : "—";
}

/* ── Queue table ─────────────────────────────────────────── */
function renderQueue() {
  const tbody = document.getElementById("queueTbody");
  const empty = document.getElementById("queueEmpty");

  if (filtered.length === 0) { tbody.innerHTML = ""; empty.classList.remove("d-none"); return; }
  empty.classList.add("d-none");

  tbody.innerHTML = filtered.map(sub => {
    const course      = courses.find(c => String(c.id) === String(sub.courseId));
    const resultCount = results.filter(r => String(r.submissionId) === String(sub.id)).length;
    const date        = new Date(sub.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const badgeStyle  = {
      pending:  "background:var(--warn-100);color:var(--warn);",
      approved: "background:var(--success-100);color:var(--success);",
      rejected: "background:var(--danger-100);color:var(--danger);",
    }[sub.status] || "";

    // Course column: code only (no title prefix to save space)
    const courseCell = course ? course.courseCode : "—";

    return `<tr>
      <td class="fw-semibold">${courseCell}</td>
      <td>${lecturerName(sub.lecturerId)}</td>
      <td>${sub.level}</td>
      <td>${sub.session} / Sem ${sub.semester}</td>
      <td>${resultCount}</td>
      <td class="text-muted-cell">${date}</td>
      <td class="text-muted-cell">v${sub.version}</td>
      <td><span class="status-badge" style="${badgeStyle}">${sub.status}</span></td>
      <td class="text-end">
        <button class="btn btn-brand btn-sm" data-action="review" data-id="${sub.id}">
          <i class="bi bi-eye"></i> Review
        </button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-action='review']").forEach(btn =>
    btn.addEventListener("click", () => openDetail(btn.dataset.id))
  );
}

/* ── Detail view ─────────────────────────────────────────── */
function openDetail(submissionId) {
  openSubmissionId = submissionId;
  const sub    = submissions.find(s => String(s.id) === String(submissionId));
  const course = courses.find(c => String(c.id) === String(sub.courseId));
  const lName  = lecturerName(sub.lecturerId);

  document.getElementById("detailHeader").innerHTML = `
    <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
      <div>
        <div class="fw-bold" style="font-family:var(--font-display);font-size:1.05rem;">
          ${course ? course.courseCode + " — " + course.courseTitle : "Unknown Course"}
        </div>
        <div class="text-muted small mt-1">
          Lecturer: <strong>${lName}</strong>
          &nbsp;·&nbsp; ${sub.session}, Semester ${sub.semester}
          &nbsp;·&nbsp; ${sub.level} Level
          &nbsp;·&nbsp; Submitted: ${new Date(sub.submittedAt).toLocaleString("en-GB")}
          &nbsp;·&nbsp; Version ${sub.version}
        </div>
        ${sub.status === "rejected" && sub.rejectionReason
          ? `<div class="text-danger small mt-1"><i class="bi bi-exclamation-circle me-1"></i>Rejection reason: ${sub.rejectionReason}</div>`
          : ""}
        ${sub.status === "approved" && sub.reviewedAt
          ? `<div class="text-success small mt-1"><i class="bi bi-check-circle me-1"></i>Approved on ${new Date(sub.reviewedAt).toLocaleString("en-GB")}</div>`
          : ""}
      </div>
    </div>`;

  const subResults  = results.filter(r => String(r.submissionId) === String(sub.id));
  const detailTbody = document.getElementById("detailScoresTbody");
  const detailEmpty = document.getElementById("detailEmpty");

  if (subResults.length === 0) {
    detailTbody.innerHTML = "";
    detailEmpty.classList.remove("d-none");
  } else {
    detailEmpty.classList.add("d-none");
    detailTbody.innerHTML = subResults.map((r, idx) => {
      const student = students.find(s => String(s.id) === String(r.studentId));
      const { grade } = scoreToGrade(r.score);
      return `<tr>
        <td>${idx + 1}</td>
        <td class="fw-semibold">${student ? student.firstName + " " + student.lastName : "Unknown"}</td>
        <td class="text-muted-cell">${student ? student.matricNumber : "—"}</td>
        <td class="fw-bold">${r.score}</td>
        <td><span class="badge-grade badge-grade--${grade.toLowerCase()}">${grade}</span></td>
      </tr>`;
    }).join("");
  }

  const reviewPanel = document.getElementById("reviewActionPanel");
  if (sub.status === "pending") {
    reviewPanel.classList.remove("d-none");
    hideReviewAlert();
    document.getElementById("rejectReasonInput").value = "";
    bindReviewActions(sub, subResults);
  } else {
    reviewPanel.classList.add("d-none");
  }

  document.getElementById("queuePanel").classList.add("d-none");
  document.getElementById("detailPanel").classList.remove("d-none");

  document.getElementById("backToQueueBtn").onclick = () => {
    document.getElementById("detailPanel").classList.add("d-none");
    document.getElementById("queuePanel").classList.remove("d-none");
  };
}

/* ── Review actions ──────────────────────────────────────── */
function bindReviewActions(sub, subResults) {
  const resultIds  = subResults.map(r => r.id);
  const approveBtn = document.getElementById("approveBtn");
  const rejectBtn  = document.getElementById("rejectBtn");
  const newApprove = approveBtn.cloneNode(true);
  const newReject  = rejectBtn.cloneNode(true);
  approveBtn.replaceWith(newApprove);
  rejectBtn.replaceWith(newReject);
  newApprove.addEventListener("click", () => handleApprove(sub.id, resultIds));
  newReject.addEventListener("click",  () => handleReject(sub.id));
}

async function handleApprove(submissionId, resultIds) {
  const approveBtn = document.getElementById("approveBtn");
  approveBtn.disabled = true;
  approveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Approving…`;
  hideReviewAlert();
  try {
    await approveSubmission(submissionId, resultIds, admin.id);
    await loadData();
    renderMetrics();
    applyFilters();
    showReviewAlert("✓ Submission approved. Results are now published to students.", "success");
    document.getElementById("reviewActionPanel").classList.add("d-none");
  } catch (err) {
    console.error(err);
    showReviewAlert("Approval failed. Please try again.", "danger");
  } finally {
    approveBtn.disabled = false;
    approveBtn.innerHTML = `<i class="bi bi-check-circle-fill"></i> Approve &amp; Publish`;
  }
}

async function handleReject(submissionId) {
  const reason = document.getElementById("rejectReasonInput").value.trim();
  if (!reason) {
    showReviewAlert("Please enter a rejection reason before rejecting.", "danger");
    document.getElementById("rejectReasonInput").focus();
    return;
  }
  const rejectBtn = document.getElementById("rejectBtn");
  rejectBtn.disabled = true;
  rejectBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Rejecting…`;
  hideReviewAlert();
  try {
    await rejectSubmission(submissionId, admin.id, reason);
    await loadData();
    renderMetrics();
    applyFilters();
    showReviewAlert("Submission rejected. The lecturer can now resubmit.", "warning");
    document.getElementById("reviewActionPanel").classList.add("d-none");
  } catch (err) {
    console.error(err);
    showReviewAlert("Rejection failed. Please try again.", "danger");
  } finally {
    rejectBtn.disabled = false;
    rejectBtn.innerHTML = `<i class="bi bi-x-circle-fill"></i> Reject`;
  }
}

/* ── Alert helpers ───────────────────────────────────────── */
function showReviewAlert(msg, type) {
  const el = document.getElementById("reviewAlert");
  el.className = `alert alert-${type} py-2 px-3 mb-3`;
  el.textContent = msg;
  el.classList.remove("d-none");
}
function hideReviewAlert() {
  const el = document.getElementById("reviewAlert");
  el.textContent = "";
  el.classList.add("d-none");
}

/* ════════════════════════════════════════════════════════
   SUBMISSION LOG TAB
   — Per-lecturer accordion, shows ALL versions (all statuses),
     grouped by lecturer → session → semester.
     Each version row shows: course, submitted date, status,
     rejection reason if any, and all student scores.
   ════════════════════════════════════════════════════════ */
function buildLogFilters() {
  const sessions = [...new Set(submissions.map(s => s.session))].sort().reverse();
  document.getElementById("logFilterSession").innerHTML =
    `<option value="">All Sessions</option>` +
    sessions.map(s => `<option value="${s}">${s}</option>`).join("");

  document.getElementById("logFilterLecturer").innerHTML =
    `<option value="">All Lecturers</option>` +
    lecturers.map(l => `<option value="${l.id}">${l.name}</option>`).join("");

  ["logFilterLecturer", "logFilterSession", "logFilterSemester", "logFilterStatus"].forEach(id =>
    document.getElementById(id).addEventListener("change", renderLog)
  );
}

function renderLog() {
  const lecId    = document.getElementById("logFilterLecturer").value;
  const session  = document.getElementById("logFilterSession").value;
  const semester = document.getElementById("logFilterSemester").value;
  const status   = document.getElementById("logFilterStatus").value;

  // Filter submissions
  const filtered = submissions.filter(s => {
    if (lecId    && String(s.lecturerId) !== String(lecId)) return false;
    if (session  && s.session !== session) return false;
    if (semester && Number(s.semester) !== Number(semester)) return false;
    if (status   && s.status !== status) return false;
    return true;
  });

  const container = document.getElementById("logAccordion");
  const empty     = document.getElementById("logEmpty");

  if (filtered.length === 0) {
    container.innerHTML = "";
    empty.classList.remove("d-none");
    return;
  }
  empty.classList.add("d-none");

  // Group by lecturer
  const byLecturer = new Map();
  filtered.forEach(sub => {
    const lid = String(sub.lecturerId);
    if (!byLecturer.has(lid)) byLecturer.set(lid, []);
    byLecturer.get(lid).push(sub);
  });

  container.innerHTML = Array.from(byLecturer.entries()).map(([lid, subs]) => {
    const lec      = lecturers.find(l => String(l.id) === lid);
    const lName    = lec ? lec.name : "Unknown";
    const initials = lName.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
    const dept     = lec ? (function(){ const d = subs[0]; return ""; })() : "";
    const collapseId = `logCol_${lid}`;

    const subsHtml = subs.map(sub => {
      const course = courses.find(c => String(c.id) === String(sub.courseId));
      const subResults = results.filter(r => String(r.submissionId) === String(sub.id));
      const date   = new Date(sub.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const badgeStyle = {
        pending:  "background:var(--warn-100);color:var(--warn);",
        approved: "background:var(--success-100);color:var(--success);",
        rejected: "background:var(--danger-100);color:var(--danger);",
      }[sub.status] || "";

      const scoresHtml = subResults.length === 0
        ? `<p class="text-muted small mb-0 px-2">No score rows linked to this submission.</p>`
        : `<div class="table-responsive mt-2">
            <table class="table table-sm admin-table mb-0" style="min-width:360px;">
              <thead><tr><th>Student</th><th>Matric</th><th>Score</th><th>Grade</th></tr></thead>
              <tbody>
                ${subResults.map(r => {
                  const st = students.find(s => String(s.id) === String(r.studentId));
                  const { grade } = scoreToGrade(r.score);
                  return `<tr>
                    <td>${st ? st.firstName + " " + st.lastName : "Unknown"}</td>
                    <td class="text-muted-cell">${st ? st.matricNumber : "—"}</td>
                    <td class="fw-semibold">${r.score}</td>
                    <td><span class="badge-grade badge-grade--${grade.toLowerCase()}">${grade}</span></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
           </div>`;

      return `<div class="card-surface mb-3" style="border-left:3px solid ${sub.status === 'approved' ? 'var(--success)' : sub.status === 'rejected' ? 'var(--danger)' : 'var(--warn)'};">
        <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap mb-2">
          <div>
            <div class="fw-semibold">${course ? course.courseCode + " — " + course.courseTitle : "Unknown Course"}</div>
            <div class="text-muted small">${sub.session} · Sem ${sub.semester} · ${sub.level} Level · ${date} · v${sub.version}</div>
            ${sub.rejectionReason ? `<div class="text-danger small mt-1"><i class="bi bi-exclamation-circle me-1"></i>${sub.rejectionReason}</div>` : ""}
            ${sub.reviewedAt && sub.status === "approved" ? `<div class="text-success small mt-1"><i class="bi bi-check-circle me-1"></i>Approved ${new Date(sub.reviewedAt).toLocaleDateString("en-GB")}</div>` : ""}
          </div>
          <span class="status-badge flex-shrink-0" style="${badgeStyle}">${sub.status}</span>
        </div>
        <details>
          <summary class="text-muted small" style="cursor:pointer;">${subResults.length} score${subResults.length === 1 ? "" : "s"} — click to view</summary>
          ${scoresHtml}
        </details>
      </div>`;
    }).join("");

    return `<div class="hist-student-card mb-3">
      <button class="hist-student-header" type="button"
        data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false">
        <span class="d-flex align-items-center gap-2">
          <span class="student-avatar-mini">${initials}</span>
          <span class="fw-semibold">${lName}</span>
        </span>
        <span class="hist-student-meta">
          <span class="badge bg-secondary">${subs.length} submission${subs.length === 1 ? "" : "s"}</span>
          <i class="bi bi-chevron-down hist-chevron ms-2"></i>
        </span>
      </button>
      <div class="collapse" id="${collapseId}">
        <div class="hist-student-body">${subsHtml}</div>
      </div>
    </div>`;
  }).join("");
}
