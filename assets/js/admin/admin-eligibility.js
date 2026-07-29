import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import {
  getStudents, getDepartments, getCourses, getResults,
  getGraduationRequirements, getResultSubmissions, updateStudent,
} from "../api.js";
import { computeGraduationEligibility } from "../utils.js";

requireAdminAuth();

/* ── State ──────────────────────────────────────────────── */
let admin = null;
let students = [], departments = [], courses = [], results = [];
let graduationRequirements = [], submissions = [];
let rows = [];          // one row per student, pre-computed eligibility
let filteredRows = [];

/* ── DOM refs ───────────────────────────────────────────── */
const pageState        = document.getElementById("pageState");
const pageContent      = document.getElementById("pageContent");
const filterDept       = document.getElementById("filterDept");
const filterLevel      = document.getElementById("filterLevel");
const filterStatus     = document.getElementById("filterStatus");
const clearFiltersBtn  = document.getElementById("clearFiltersBtn");
const searchInput      = document.getElementById("searchInput");
const resultCount      = document.getElementById("resultCount");
const eligTbody        = document.getElementById("eligTbody");
const emptyState       = document.getElementById("emptyState");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar        = document.getElementById("appSidebar");
const appSidebarScrim   = document.getElementById("appSidebarScrim");
const logoutBtn         = document.getElementById("logoutBtn");

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    admin = getCurrentAdmin();
    if (!admin) { window.location.href = "/assets/pages/admin/admin-login.html"; return; }
    setupSidebar();
    setupLogout();
    markEligibleModal = new bootstrap.Modal(document.getElementById("markEligibleModal"));
    document.getElementById("confirmMarkEligibleBtn")?.addEventListener("click", handleMarkEligible);
    await loadData();
    buildRows();
    populateFilterSelects();
    renderMetrics(rows);
    pageState.classList.add("d-none");
    pageContent.classList.remove("d-none");
    filteredRows = [...rows];
    renderTable();
    bindEvents();
  } catch (err) {
    console.error(err);
    pageState.innerHTML = `<div class="alert alert-danger mb-0">Failed to load eligibility report.</div>`;
  }
}

async function loadData() {
  [students, departments, courses, results, graduationRequirements, submissions] = await Promise.all([
    getStudents(), getDepartments(), getCourses(), getResults(),
    getGraduationRequirements(), getResultSubmissions(),
  ]);
}

/* ── Compute one eligibility row per student ─────────────── */
function buildRows() {
  rows = students.map((s) => {
    const dept = departments.find(d => Number(d.id) === Number(s.departmentId));
    const studentResults = results.filter(r => Number(r.studentId) === Number(s.id));
    const eligibility = computeGraduationEligibility(s, studentResults, courses, dept, graduationRequirements);
    return { student: s, department: dept, eligibility };
  }).filter(row => row.eligibility); // skip students whose department has no matching requirement
}

/* ── Sidebar / logout ───────────────────────────────────── */
function setupSidebar() {
  document.getElementById("sidebarUserName").textContent = admin.name || "Admin";
  document.getElementById("sidebarUserMeta").textContent = admin.email;
  document.getElementById("sidebarAvatarInitials").textContent =
    (admin.name || "A").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  const pendingCount = submissions.filter(s => s.status === "pending").length;
  const badge = document.getElementById("sidebarPendingBadge");
  if (badge && pendingCount > 0) { badge.textContent = pendingCount; badge.style.display = ""; }

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

/* ── Filter selects ───────────────────────────────────────── */
function populateFilterSelects() {
  filterDept.innerHTML =
    `<option value="">All Departments</option>` +
    departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
}

/* ── Metrics ──────────────────────────────────────────────── */
function renderMetrics(list) {
  document.getElementById("mTotal").textContent = list.length;
  document.getElementById("mEligible").textContent =
    list.filter(r => r.eligibility.status === "eligible").length;
  document.getElementById("mShort").textContent =
    list.filter(r => r.eligibility.status === "short-total").length;
  document.getElementById("mCoreShort").textContent =
    list.filter(r => r.eligibility.status === "short-core" || r.eligibility.status === "short-both").length;
}

/* ── Status badge helpers ─────────────────────────────────── */
const STATUS_LABEL = {
  "eligible":    "Eligible",
  "short-total": "Short on units",
  "short-core":  "Short on core units",
  "short-both":  "Short on units & core",
};
const STATUS_CLASS = {
  "eligible":    "eligible",
  "short-total": "short",
  "short-core":  "critical",
  "short-both":  "critical",
};

function statusDetail(row) {
  const e = row.eligibility;
  const parts = [];
  if (e.unitsShort > 0) parts.push(`${e.unitsShort} total unit${e.unitsShort === 1 ? "" : "s"} short`);
  if (e.coreShort > 0) parts.push(`${e.coreShort} core unit${e.coreShort === 1 ? "" : "s"} short`);
  return parts.length ? parts.join(" · ") : "Meets requirements";
}

/* ── State for pagination ─────────────────────────────────── */
const ELIG_PAGE_SIZE = 10;
let eligPage = 1;

/* ── Render table ─────────────────────────────────────────── */
function renderTable() {
  const total = filteredRows.length;
  if (total === 0) {
    eligTbody.innerHTML = "";
    emptyState.classList.remove("d-none");
    resultCount.textContent = "";
    renderEligPagination(0);
    return;
  }
  emptyState.classList.add("d-none");

  const totalPages = Math.max(1, Math.ceil(total / ELIG_PAGE_SIZE));
  if (eligPage > totalPages) eligPage = totalPages;
  const start = (eligPage - 1) * ELIG_PAGE_SIZE;
  const paged = filteredRows.slice(start, start + ELIG_PAGE_SIZE);

  resultCount.textContent = `${total} student${total === 1 ? "" : "s"}`;
  const paginationInfo = document.getElementById("eligPaginationInfo");
  if (paginationInfo) paginationInfo.textContent = total
    ? `Showing ${start + 1}–${Math.min(start + ELIG_PAGE_SIZE, total)} of ${total}`
    : "";

  eligTbody.innerHTML = paged.map((row) => {
    const s   = row.student;
    const e   = row.eligibility;
    const cls = STATUS_CLASS[e.status];

    const isAlreadyMarked = s.graduationStatus === "eligible";
    const canMark         = e.status === "eligible";

    let actionCell;
    if (isAlreadyMarked) {
      actionCell = `<td class="text-end"><span class="status-badge status-badge--completed"><i class="bi bi-check2-circle me-1"></i>Marked Eligible</span></td>`;
    } else if (canMark) {
      actionCell = `<td class="text-end"><button class="btn btn-brand btn-sm" data-mark-id="${s.id}"><i class="bi bi-mortarboard"></i> Mark Eligible</button></td>`;
    } else {
      actionCell = `<td class="text-end"><span class="text-muted small">Not yet eligible</span></td>`;
    }

    return `
      <tr>
        <td>${s.firstName} ${s.lastName}</td>
        <td>${s.matricNumber}</td>
        <td class="cell-wrap">${s.programme || "—"}</td>
        <td>${s.level}L</td>
        <td>${e.totalUnits} / ${e.minTotalUnits}</td>
        <td>${e.coreUnits} / ${e.minCoreUnits}</td>
        <td>
          <span class="status-badge status-badge--${cls}">${STATUS_LABEL[e.status]}</span>
          <div class="text-muted small mt-1">${statusDetail(row)}</div>
        </td>
        ${actionCell}
      </tr>
    `;
  }).join("");

  /* Wire Mark Eligible buttons */
  eligTbody.querySelectorAll("[data-mark-id]").forEach(btn =>
    btn.addEventListener("click", () => openMarkEligibleModal(btn.dataset.markId)));

  renderEligPagination(totalPages);
}

function renderEligPagination(totalPages) {
  const list = document.getElementById("eligPaginationList");
  if (!list) return;
  if (totalPages <= 1) { list.innerHTML = ""; return; }
  let html = `<li class="page-item${eligPage===1?" disabled":""}"><button class="page-link" data-page="${eligPage-1}">&lsaquo;</button></li>`;
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && Math.abs(i - eligPage) > 2 && i !== 1 && i !== totalPages) {
      if (i === 2 || i === totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      continue;
    }
    html += `<li class="page-item${i===eligPage?" active":""}"><button class="page-link" data-page="${i}">${i}</button></li>`;
  }
  html += `<li class="page-item${eligPage===totalPages?" disabled":""}"><button class="page-link" data-page="${eligPage+1}">&rsaquo;</button></li>`;
  list.innerHTML = html;
  list.querySelectorAll("[data-page]").forEach(btn =>
    btn.addEventListener("click", () => { eligPage = Number(btn.dataset.page); renderTable(); }));
}

/* ── Filtering ────────────────────────────────────────────── */
function applyFilters() {
  const dept = filterDept.value;
  const level = filterLevel.value;
  const status = filterStatus.value;
  const query = searchInput.value.trim().toLowerCase();

  filteredRows = rows.filter((row) => {
    const s = row.student;
    if (dept && String(s.departmentId) !== String(dept)) return false;
    if (level && String(s.level) !== String(level)) return false;
    if (status && row.eligibility.status !== status) return false;
    if (query) {
      const haystack = `${s.firstName} ${s.lastName} ${s.matricNumber}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  eligPage = 1;
  renderTable();
}

function bindEvents() {
  filterDept.addEventListener("change", applyFilters);
  filterLevel.addEventListener("change", applyFilters);
  filterStatus.addEventListener("change", applyFilters);
  searchInput.addEventListener("input", applyFilters);
  clearFiltersBtn.addEventListener("click", () => {
    filterDept.value = "";
    filterLevel.value = "";
    filterStatus.value = "";
    searchInput.value = "";
    applyFilters();
  });
}

/* ── Mark as Eligible ─────────────────────────────────────── */
let markEligibleStudentId = null;
let markEligibleModal = null;

function openMarkEligibleModal(studentId) {
  const row = rows.find(r => String(r.student.id) === String(studentId));
  if (!row) return;
  markEligibleStudentId = studentId;
  const s = row.student;
  document.getElementById("markEligibleBody").textContent =
    `This will mark ${s.firstName} ${s.lastName} (${s.matricNumber}) as eligible for graduation. `+
    `They have met all unit requirements (${row.eligibility.totalUnits} total, ${row.eligibility.coreUnits} core units). `+
    `This can be changed later if needed.`;
  markEligibleModal.show();
}

/* confirmMarkEligibleBtn is bound inside init() via bindEvents() — no separate DOMContentLoaded needed */

async function handleMarkEligible() {
  if (!markEligibleStudentId) return;
  const confirmBtn = document.getElementById("confirmMarkEligibleBtn");
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Saving…`;

  try {
    await updateStudent(markEligibleStudentId, { graduationStatus: "eligible" });

    /* Update local state */
    const idx = students.findIndex(s => String(s.id) === String(markEligibleStudentId));
    if (idx !== -1) students[idx].graduationStatus = "eligible";

    /* Rebuild rows so the button state updates */
    buildRows();
    applyFilters();
    renderMetrics(rows);

    markEligibleModal.hide();
  } catch (err) {
    console.error(err);
    alert("Failed to update student status. Please try again.");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = `<i class="bi bi-check2-circle"></i> Yes, Mark Eligible`;
  }
}
