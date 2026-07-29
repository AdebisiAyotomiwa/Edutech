import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import {
  getLecturers, createLecturer, updateLecturer, deleteLecturer,
  getCourseAssignments, createCourseAssignment, deleteCourseAssignment,
  getCourses, getDepartments, getResultSubmissions, getAcademicCalendar,
} from "../api.js";

requireAdminAuth();

/* ── State ──────────────────────────────────────────────── */
let admin       = null;
let lecturers   = [];
let courses     = [];
let departments = [];
let assignments = [];
let submissions = [];   // used for pending badge count
let calendar    = null;

/* Editing state */
let editingLecturerId   = null;
let editingAssignmentId = null;
let pendingDeleteType   = null;   // "lecturer" | "assignment"
let pendingDeleteId     = null;

/* ── DOM refs ───────────────────────────────────────────── */
const pageState   = document.getElementById("pageState");
const pageContent = document.getElementById("pageContent");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar  = document.getElementById("appSidebar");
const appSidebarScrim = document.getElementById("appSidebarScrim");
const logoutBtn   = document.getElementById("logoutBtn");

let lecturerModal    = null;
let assignmentModal  = null;
let deleteConfirmModal = null;

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

    /* Initialise modals after DOM is ready */
    lecturerModal      = new bootstrap.Modal(document.getElementById("lecturerModal"));
    assignmentModal    = new bootstrap.Modal(document.getElementById("assignmentModal"));
    deleteConfirmModal = new bootstrap.Modal(document.getElementById("deleteConfirmModal"));

    await loadData();

    populateDeptSelect();
    populateAssignmentSelects();
    bindTabs();
    bindLecturerEvents();
    bindAssignmentEvents();

    pageState.classList.add("d-none");
    pageContent.classList.remove("d-none");

    renderLecturers();
    renderAssignments();
  } catch (err) {
    console.error(err);
    pageState.innerHTML = `<div class="alert alert-danger mb-0">Failed to load data.</div>`;
  }
}

/* ── Data ───────────────────────────────────────────────── */
async function loadData() {
  [lecturers, courses, departments, assignments, submissions, calendar] = await Promise.all([
    getLecturers(),
    getCourses(),
    getDepartments(),
    getCourseAssignments(),
    getResultSubmissions(),
    getAcademicCalendar(),
  ]);
}

/* ── Sidebar ────────────────────────────────────────────── */
function setupSidebar() {
  const initials = (admin.name || "A").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("sidebarAvatarInitials").textContent = initials;
  document.getElementById("sidebarUserName").textContent       = admin.name || "Admin";
  document.getElementById("sidebarUserMeta").textContent       = admin.email;

  // Pending badge on Approvals nav link
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

/* ── Tabs ───────────────────────────────────────────────── */
function bindTabs() {
  document.getElementById("mainTabs").querySelectorAll(".nav-link").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("mainTabs").querySelectorAll(".nav-link").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("lecturersTab").classList.toggle("d-none",   tab !== "lecturers");
      document.getElementById("assignmentsTab").classList.toggle("d-none", tab !== "assignments");
    });
  });
}

/* ── Populate selects ───────────────────────────────────── */
function populateDeptSelect() {
  document.getElementById("lDepartment").innerHTML =
    `<option value="">Select department…</option>` +
    departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
}

function populateAssignmentSelects() {
  document.getElementById("aLecturer").innerHTML =
    `<option value="">Select lecturer…</option>` +
    lecturers.map(l => `<option value="${l.id}">${l.title ? l.title + " " : ""}${l.name} (${l.staffId})</option>`).join("");

  document.getElementById("aCourse").innerHTML =
    `<option value="">Select course…</option>` +
    courses
      .filter(c => (c.status || "active") === "active")
      .map(c => `<option value="${c.id}">${c.courseCode} — ${c.courseTitle}</option>`)
      .join("");
}

/* ── Lecturers tab ───────────────────────────────────────── */
const LECT_PAGE_SIZE = 15;
let lectPage = 1;

function bindLecturerEvents() {
  document.getElementById("lecturerSearch").addEventListener("input", () => { lectPage = 1; renderLecturers(); });
  document.getElementById("addLecturerBtn").addEventListener("click", openAddLecturerModal);
  document.getElementById("lecturerForm").addEventListener("submit", handleLecturerFormSubmit);
  document.getElementById("confirmDeleteBtn").addEventListener("click", handleConfirmedDelete);
}

function renderLecturers() {
  const q = document.getElementById("lecturerSearch").value.trim().toLowerCase();
  const filtered = lecturers.filter(l =>
    !q || l.name.toLowerCase().includes(q) || (l.title || "").toLowerCase().includes(q) ||
    l.staffId.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / LECT_PAGE_SIZE));
  if (lectPage > totalPages) lectPage = totalPages;
  const start  = (lectPage - 1) * LECT_PAGE_SIZE;
  const paged  = filtered.slice(start, start + LECT_PAGE_SIZE);

  const info = document.getElementById("lecturerPaginationInfo");
  if (info) info.textContent = filtered.length
    ? `Showing ${start + 1}–${Math.min(start + LECT_PAGE_SIZE, filtered.length)} of ${filtered.length}`
    : "";

  const tbody = document.getElementById("lecturersTbody");
  const empty = document.getElementById("lecturersEmpty");

  if (paged.length === 0) { tbody.innerHTML = ""; empty.classList.remove("d-none"); renderLectPagination(0); return; }
  empty.classList.add("d-none");

  tbody.innerHTML = paged.map(l => {
    const dept      = departments.find(d => String(d.id) === String(l.departmentId));
    // Count only current semester assignments
    const currCount = assignments.filter(a =>
      String(a.lecturerId) === String(l.id) &&
      calendar && a.session === calendar.currentSession &&
      Number(a.semester) === Number(calendar.currentSemester)
    ).length;
    const initials    = l.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
    const displayName = `${l.title ? l.title + " " : ""}${l.name}`;
    return `<tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <span class="student-avatar-mini">${initials}</span>
          <span class="fw-semibold">${displayName}</span>
        </div>
      </td>
      <td class="text-muted-cell">${l.staffId}</td>
      <td class="text-muted-cell">${l.email}</td>
      <td>${dept?.name ?? "—"}</td>
      <td>${currCount} course${currCount === 1 ? "" : "s"} (current sem)</td>
      <td>
        <div class="admin-row-actions">
          <button class="btn btn-secondary-outline btn-sm" data-action="edit"   data-id="${l.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-danger-soft btn-sm"       data-action="delete" data-id="${l.id}" title="Delete"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.action === "edit")   openEditLecturerModal(btn.dataset.id);
      if (btn.dataset.action === "delete") confirmDeleteLecturer(btn.dataset.id);
    });
  });

  renderLectPagination(totalPages);
}

function renderLectPagination(totalPages) {
  const list = document.getElementById("lecturerPaginationList");
  if (!list) return;
  if (totalPages <= 1) { list.innerHTML = ""; return; }
  let html = `<li class="page-item${lectPage===1?" disabled":""}"><button class="page-link" data-page="${lectPage-1}">&lsaquo;</button></li>`;
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && Math.abs(i - lectPage) > 2 && i !== 1 && i !== totalPages) {
      if (i === 2 || i === totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      continue;
    }
    html += `<li class="page-item${i===lectPage?" active":""}"><button class="page-link" data-page="${i}">${i}</button></li>`;
  }
  html += `<li class="page-item${lectPage===totalPages?" disabled":""}"><button class="page-link" data-page="${lectPage+1}">&rsaquo;</button></li>`;
  list.innerHTML = html;
  list.querySelectorAll("[data-page]").forEach(btn =>
    btn.addEventListener("click", () => { lectPage = Number(btn.dataset.page); renderLecturers(); }));
}

function openAddLecturerModal() {
  editingLecturerId = null;
  document.getElementById("lecturerModalTitle").textContent = "Add Lecturer";
  document.getElementById("lecturerForm").reset();
  document.getElementById("lPasswordWrap").classList.remove("d-none");
  document.getElementById("lPassword").required = true;
  hideAlert("lecturerFormAlert");
  lecturerModal.show();
}

function openEditLecturerModal(id) {
  const l = lecturers.find(lec => String(lec.id) === String(id));
  if (!l) return;
  editingLecturerId = id;
  document.getElementById("lecturerModalTitle").textContent = `Edit — ${l.title ? l.title + " " : ""}${l.name}`;
  document.getElementById("lTitle").value      = l.title || "";
  document.getElementById("lName").value       = l.name;
  document.getElementById("lStaffId").value    = l.staffId;
  document.getElementById("lPhone").value      = l.phone || "";
  document.getElementById("lEmail").value      = l.email;
  document.getElementById("lDepartment").value = l.departmentId;
  document.getElementById("lPasswordWrap").classList.remove("d-none");
  document.getElementById("lPassword").required = false;
  document.getElementById("lPassword").value    = "";
  hideAlert("lecturerFormAlert");
  lecturerModal.show();
}

function confirmDeleteLecturer(id) {
  const l = lecturers.find(lec => String(lec.id) === String(id));
  if (!l) return;
  pendingDeleteType = "lecturer";
  pendingDeleteId   = id;
  document.getElementById("deleteConfirmTitle").textContent = "Delete this lecturer?";
  document.getElementById("deleteConfirmBody").textContent =
    `This will permanently remove ${l.name} (${l.staffId}). Their course assignments will also be removed.`;
  deleteConfirmModal.show();
}

/* ── Assignments tab ─────────────────────────────────────── */
function bindAssignmentEvents() {
  document.getElementById("assignmentForm").addEventListener("submit", handleAssignmentFormSubmit);
}

function openAddAssignmentModal() {
  editingAssignmentId = null;
  document.getElementById("assignmentModalTitle").textContent = "Add Course Assignment";
  document.getElementById("assignmentForm").reset();
  hideAlert("assignmentFormAlert");
  assignmentModal.show();
}

async function handleAssignmentFormSubmit(e) {
  e.preventDefault();
  hideAlert("assignmentFormAlert");

  const lecturerId = document.getElementById("aLecturer").value;
  const courseId   = document.getElementById("aCourse").value;
  const session    = document.getElementById("aSession").value.trim();
  const semester   = Number(document.getElementById("aSemester").value);

  if (!lecturerId || !courseId || !session || !semester) {
    showAlert("assignmentFormAlert", "Please fill in all fields."); return;
  }

  // Duplicate check — same lecturer + course + session + semester
  const dup = assignments.find(a =>
    String(a.lecturerId) === String(lecturerId) &&
    String(a.courseId)   === String(courseId) &&
    a.session             === session &&
    Number(a.semester)    === semester
  );
  if (dup) {
    showAlert("assignmentFormAlert", "This assignment already exists."); return;
  }

  try {
    const created = await createCourseAssignment({ lecturerId, courseId, session, semester });
    assignments.push(created);
    assignmentModal.hide();
    renderAssignments();
  } catch (err) {
    console.error(err);
    showAlert("assignmentFormAlert", "Failed to save. Please try again.");
  }
}

function confirmDeleteAssignment(id) {
  const a = assignments.find(ass => String(ass.id) === String(id));
  if (!a) return;
  pendingDeleteType = "assignment";
  pendingDeleteId   = id;
  const lecturer = lecturers.find(l => String(l.id) === String(a.lecturerId));
  const course   = courses.find(c => String(c.id) === String(a.courseId));
  document.getElementById("deleteConfirmTitle").textContent = "Remove this assignment?";
  document.getElementById("deleteConfirmBody").textContent =
    `Remove "${course?.courseCode ?? "?"}" from ${lecturer?.name ?? "?"} for ${a.session} Sem ${a.semester}?`;
  deleteConfirmModal.show();
}

/* ── Shared delete handler ──────────────────────────────── */
async function handleConfirmedDelete() {
  try {
    if (pendingDeleteType === "lecturer") {
      // Also remove all assignments for this lecturer
      const lecturerAssignments = assignments.filter(a => String(a.lecturerId) === String(pendingDeleteId));
      await Promise.all(lecturerAssignments.map(a => deleteCourseAssignment(a.id)));
      await deleteLecturer(pendingDeleteId);
      lecturers   = lecturers.filter(l => String(l.id) !== String(pendingDeleteId));
      assignments = assignments.filter(a => String(a.lecturerId) !== String(pendingDeleteId));
      populateAssignmentSelects();
      renderLecturers();
      renderAssignments();
    } else if (pendingDeleteType === "assignment") {
      await deleteCourseAssignment(pendingDeleteId);
      assignments = assignments.filter(a => String(a.id) !== String(pendingDeleteId));
      renderAssignments();
      renderLecturers();   // refresh assignment count
    }
    deleteConfirmModal.hide();
  } catch (err) {
    console.error(err);
    alert("Failed to delete. Please try again.");
  } finally {
    pendingDeleteType = null;
    pendingDeleteId   = null;
  }
}

/* ── Helpers ────────────────────────────────────────────── */
function showAlert(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.remove("d-none"); }
function hideAlert(id)      { const el = document.getElementById(id); el.textContent = "";  el.classList.add("d-none"); }

/* ── Override: handleLecturerFormSubmit with title + phone ─ */
async function handleLecturerFormSubmit(e) {
  e.preventDefault();
  hideAlert("lecturerFormAlert");

  const title    = document.getElementById("lTitle")?.value.trim() || "";
  const name     = document.getElementById("lName").value.trim();
  const staffId  = document.getElementById("lStaffId").value.trim().toUpperCase();
  const phone    = document.getElementById("lPhone")?.value.trim() || "";
  const email    = document.getElementById("lEmail").value.trim();
  const deptId   = document.getElementById("lDepartment").value;
  const password = document.getElementById("lPassword").value.trim();

  if (!title || !name || !staffId || !email || !deptId) {
    showAlert("lecturerFormAlert", "Please fill in all required fields."); return;
  }

  const dupStaff = lecturers.find(l =>
    l.staffId.toUpperCase() === staffId && String(l.id) !== String(editingLecturerId));
  if (dupStaff) { showAlert("lecturerFormAlert", `Staff ID "${staffId}" already exists.`); return; }

  const dupEmail = lecturers.find(l =>
    l.email.toLowerCase() === email.toLowerCase() && String(l.id) !== String(editingLecturerId));
  if (dupEmail) { showAlert("lecturerFormAlert", "A lecturer with this email already exists."); return; }

  const data = { title, name, staffId, phone, email, departmentId: deptId, role: "lecturer" };

  if (editingLecturerId === null) {
    if (!password || password.length < 6) {
      showAlert("lecturerFormAlert", "Password must be at least 6 characters."); return;
    }
    data.password = password;
  } else if (password) {
    data.password = password;
  }

  try {
    if (editingLecturerId === null) {
      const created = await createLecturer(data);
      lecturers.push(created);
    } else {
      const updated = await updateLecturer(editingLecturerId, data);
      const idx = lecturers.findIndex(l => String(l.id) === String(editingLecturerId));
      lecturers[idx] = { ...lecturers[idx], ...updated };
    }
    lecturerModal.hide();
    populateAssignmentSelects();
    renderLecturers();
    renderAssignments();
  } catch (err) {
    console.error(err);
    showAlert("lecturerFormAlert", "Failed to save. Please try again.");
  }
}

/* ── Override: renderAssignments as per-lecturer accordion ─ */
function renderAssignments() {
  const container = document.getElementById("assignmentsAccordion");
  const empty     = document.getElementById("assignmentsEmpty");
  if (!container) return;

  if (lecturers.length === 0) { container.innerHTML = ""; empty.classList.remove("d-none"); return; }
  empty.classList.add("d-none");

  container.innerHTML = lecturers.map((lec) => {
    const lecAssignments = assignments.filter(a => String(a.lecturerId) === String(lec.id));
    const initials       = lec.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
    const displayName    = `${lec.title ? lec.title + " " : ""}${lec.name}`;
    const dept           = departments.find(d => String(d.id) === String(lec.departmentId));
    const collapseId     = `asnCol_${lec.id}`;

    // Group assignments by session+semester for cleaner display
    const grouped = new Map();
    lecAssignments.forEach(a => {
      const key = `${a.session}|${a.semester}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(a);
    });
    const sortedGroups = Array.from(grouped.entries())
      .sort(([a], [b]) => {
        const [sa, sema] = a.split("|");
        const [sb, semb] = b.split("|");
        return sa !== sb ? sb.localeCompare(sa) : Number(sema) - Number(semb);
      });

    const rowsHtml = lecAssignments.length === 0
      ? `<tr><td colspan="4" class="text-muted text-center py-3 small">No courses assigned yet</td></tr>`
      : sortedGroups.map(([key, groupAssns]) => {
          const [sess, sem] = key.split("|");
          const isCurrent = calendar &&
            sess === calendar.currentSession &&
            Number(sem) === Number(calendar.currentSemester);
          const groupHeader = `<tr style="background:var(--paper-50);">
            <td colspan="4" class="fw-semibold small py-1 px-3" style="border-bottom:1px solid var(--line-200);">
              ${sess} — Semester ${sem}
              ${isCurrent ? `<span class="status-badge status-badge--completed ms-2" style="font-size:.68rem;">Current</span>` : ""}
            </td>
          </tr>`;
          const courseRows = groupAssns.map(a => {
            const course = courses.find(c => String(c.id) === String(a.courseId));
            return `<tr>
              <td class="fw-semibold">${course?.courseCode ?? "—"}</td>
              <td class="cell-wrap">${course?.courseTitle ?? "Unknown"}</td>
              <td class="text-muted-cell">${course?.level ?? "—"}</td>
              <td class="text-end">
                <button class="btn btn-danger-soft btn-sm" data-del-asn="${a.id}" title="Remove"><i class="bi bi-trash"></i></button>
              </td>
            </tr>`;
          }).join("");
          return groupHeader + courseRows;
        }).join("");

    return `<div class="hist-student-card mb-2">
      <button class="hist-student-header" type="button"
        data-bs-toggle="collapse" data-bs-target="#${collapseId}"
        aria-expanded="false">
        <span class="d-flex align-items-center gap-2">
          <span class="student-avatar-mini">${initials}</span>
          <span>
            <span class="fw-semibold">${displayName}</span>
            <span class="text-muted-cell ms-2 small">${dept?.name ?? "—"} · ${lec.staffId}</span>
          </span>
        </span>
        <span class="hist-student-meta">
          <button class="btn btn-brand btn-sm me-2" data-add-asn="${lec.id}" onclick="event.stopPropagation()">
            <i class="bi bi-plus-lg"></i> Add
          </button>
          <span class="badge bg-secondary">${lecAssignments.length}</span>
          <i class="bi bi-chevron-down hist-chevron ms-2"></i>
        </span>
      </button>
      <div class="collapse" id="${collapseId}">
        <div class="hist-student-body p-0">
          <div class="table-responsive">
            <table class="table table-sm admin-table table-sticky-first mb-0" style="min-width:400px;">
              <thead><tr><th>Code</th><th>Title</th><th>Level</th><th class="text-end">Action</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");

  /* Wire remove buttons */
  container.querySelectorAll("[data-del-asn]").forEach(btn =>
    btn.addEventListener("click", () => confirmDeleteAssignment(btn.dataset.delAsn)));

  /* Wire add buttons — pre-fill lecturer in assignment modal */
  container.querySelectorAll("[data-add-asn]").forEach(btn =>
    btn.addEventListener("click", () => {
      openAddAssignmentModal();
      document.getElementById("aLecturer").value = btn.dataset.addAsn;
    }));
}