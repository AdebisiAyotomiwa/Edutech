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
const pageState       = document.getElementById("pageState");
const pageContent     = document.getElementById("pageContent");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar      = document.getElementById("appSidebar");
const appSidebarScrim = document.getElementById("appSidebarScrim");
const logoutBtn       = document.getElementById("logoutBtn");

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    admin = getCurrentAdmin();
    if (!admin) {
      window.location.href = "/assets/pages/admin/admin-login.html";
      return;
    }

    setupSidebar();
    setupLogout();
    await loadData();

    buildSessionFilter();
    bindFilters();
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
  // Newest first
  submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

/* ── Sidebar ────────────────────────────────────────────── */
function setupSidebar() {
  const initials = (admin.name || "A").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("sidebarAvatarInitials").textContent = initials;
  document.getElementById("sidebarUserName").textContent       = admin.name || "Admin";
  document.getElementById("sidebarUserMeta").textContent       = admin.email;

  // Show pending count badge in sidebar
  const pendingCount = submissions.filter(s => s.status === "pending").length;
  const badge = document.getElementById("sidebarPendingBadge");
  if (pendingCount > 0) {
    badge.textContent = pendingCount;
    badge.style.display = "";
  }

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
    adminLogout();
    window.location.href = "/assets/pages/admin/admin-login.html";
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

  renderQueue();
  // Close detail panel when filters change
  document.getElementById("detailPanel").classList.add("d-none");
  document.getElementById("queuePanel").classList.remove("d-none");
}

/* ── Queue table ─────────────────────────────────────────── */
function renderQueue() {
  const tbody = document.getElementById("queueTbody");
  const empty = document.getElementById("queueEmpty");

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("d-none");
    return;
  }
  empty.classList.add("d-none");

  tbody.innerHTML = filtered.map(sub => {
    const course   = courses.find(c => String(c.id) === String(sub.courseId));
    const lecturer = lecturers.find(l => String(l.id) === String(sub.lecturerId));

    // Count result rows linked to this submission
    const resultCount = results.filter(r =>
      String(r.submissionId) === String(sub.id)
    ).length;

    const date = new Date(sub.submittedAt).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric"
    });

    const badgeStyle = {
      pending:  "background:var(--warn-100);color:var(--warn);",
      approved: "background:var(--success-100);color:var(--success);",
      rejected: "background:var(--danger-100);color:var(--danger);",
    }[sub.status] || "";

    return `<tr>
      <td class="fw-semibold">${course ? course.courseCode + " — " + course.courseTitle : "—"}</td>
      <td>${lecturer ? lecturer.name : "—"}</td>
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

  // Bind Review buttons
  tbody.querySelectorAll("[data-action='review']").forEach(btn =>
    btn.addEventListener("click", () => openDetail(btn.dataset.id))
  );
}

/* ── Detail view ─────────────────────────────────────────── */
function openDetail(submissionId) {
  openSubmissionId = submissionId;
  const sub      = submissions.find(s => String(s.id) === String(submissionId));
  const course   = courses.find(c => String(c.id) === String(sub.courseId));
  const lecturer = lecturers.find(l => String(l.id) === String(sub.lecturerId));

  // Build header card
  document.getElementById("detailHeader").innerHTML = `
    <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
      <div>
        <div class="fw-bold" style="font-family:var(--font-display);font-size:1.05rem;">
          ${course ? course.courseCode + " — " + course.courseTitle : "Unknown Course"}
        </div>
        <div class="text-muted small mt-1">
          Lecturer: <strong>${lecturer ? lecturer.name : "Unknown"}</strong>
          &nbsp;·&nbsp; ${sub.session}, Semester ${sub.semester}
          &nbsp;·&nbsp; ${sub.level} Level
          &nbsp;·&nbsp; Submitted: ${new Date(sub.submittedAt).toLocaleString("en-GB")}
          &nbsp;·&nbsp; Version ${sub.version}
        </div>
        ${sub.status === "rejected" && sub.rejectionReason
          ? `<div class="text-danger small mt-1"><i class="bi bi-exclamation-circle me-1"></i>Prev. rejection: ${sub.rejectionReason}</div>`
          : ""}
        ${sub.status === "approved" && sub.reviewedAt
          ? `<div class="text-success small mt-1"><i class="bi bi-check-circle me-1"></i>Approved on ${new Date(sub.reviewedAt).toLocaleString("en-GB")}</div>`
          : ""}
      </div>
    </div>`;

  // Fill scores table
  const subResults = results.filter(r => String(r.submissionId) === String(sub.id));
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

  // Show / hide review action panel depending on status
  const reviewPanel = document.getElementById("reviewActionPanel");
  if (sub.status === "pending") {
    reviewPanel.classList.remove("d-none");
    hideReviewAlert();
    document.getElementById("rejectReasonInput").value = "";
    // Bind approve/reject once (remove old listeners first by replacing element)
    bindReviewActions(sub, subResults);
  } else {
    reviewPanel.classList.add("d-none");
  }

  // Show detail, hide queue
  document.getElementById("queuePanel").classList.add("d-none");
  document.getElementById("detailPanel").classList.remove("d-none");

  // Back button
  document.getElementById("backToQueueBtn").onclick = () => {
    document.getElementById("detailPanel").classList.add("d-none");
    document.getElementById("queuePanel").classList.remove("d-none");
  };
}

/* ── Review actions ──────────────────────────────────────── */
function bindReviewActions(sub, subResults) {
  const resultIds = subResults.map(r => r.id);

  const approveBtn = document.getElementById("approveBtn");
  const rejectBtn  = document.getElementById("rejectBtn");

  // Clone to remove any previously attached listeners
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
    /*
     * APPROVAL CASCADE (client-side sequential PATCHes):
     * See api.js approveSubmission() for the full explanation.
     * 1. Flip every result row to published: true
     * 2. Mark submission as approved
     * This order means if step 1 fails, the submission stays
     * "pending" and the admin can safely retry.
     */
    await approveSubmission(submissionId, resultIds, admin.id);

    // Update local state so the UI reflects the change immediately
    const idx = submissions.findIndex(s => String(s.id) === String(submissionId));
    if (idx !== -1) {
      submissions[idx].status     = "approved";
      submissions[idx].reviewedBy = admin.id;
      submissions[idx].reviewedAt = new Date().toISOString();
    }

    renderMetrics();
    applyFilters();

    showReviewAlert("✓ Submission approved. Results are now published to students.", "success");
    document.getElementById("reviewActionPanel").classList.add("d-none");
  } catch (err) {
    console.error(err);
    showReviewAlert("Approval failed. Some result rows may not have been published. Please try again.", "danger");
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

    // Update local state
    const idx = submissions.findIndex(s => String(s.id) === String(submissionId));
    if (idx !== -1) {
      submissions[idx].status          = "rejected";
      submissions[idx].reviewedBy      = admin.id;
      submissions[idx].reviewedAt      = new Date().toISOString();
      submissions[idx].rejectionReason = reason;
    }

    renderMetrics();
    applyFilters();

    showReviewAlert(`Submission rejected. The lecturer will be notified and can resubmit.`, "warning");
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
