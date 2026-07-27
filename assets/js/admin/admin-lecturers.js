import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import {
  getLecturers, createLecturer, updateLecturer, deleteLecturer,
  getCourseAssignments, createCourseAssignment, deleteCourseAssignment,
  getCourses, getDepartments, getResultSubmissions,
} from "../api.js";

requireAdminAuth();

/* ── State ──────────────────────────────────────────────── */
let admin       = null;
let lecturers   = [];
let courses     = [];
let departments = [];
let assignments = [];
let submissions = [];   // used for pending badge count

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

const lecturerModal    = new bootstrap.Modal(document.getElementById("lecturerModal"));
const assignmentModal  = new bootstrap.Modal(document.getElementById("assignmentModal"));
const deleteConfirmModal = new bootstrap.Modal(document.getElementById("deleteConfirmModal"));

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
  [lecturers, courses, departments, assignments, submissions] = await Promise.all([
    getLecturers(),
    getCourses(),
    getDepartments(),
    getCourseAssignments(),
    getResultSubmissions(),
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
    lecturers.map(l => `<option value="${l.id}">${l.name} (${l.staffId})</option>`).join("");

  document.getElementById("aCourse").innerHTML =
    `<option value="">Select course…</option>` +
    courses
      .filter(c => (c.status || "active") === "active")
      .map(c => `<option value="${c.id}">${c.courseCode} — ${c.courseTitle}</option>`)
      .join("");
}

/* ── Lecturers tab ───────────────────────────────────────── */
function bindLecturerEvents() {
  document.getElementById("lecturerSearch").addEventListener("input", renderLecturers);
  document.getElementById("addLecturerBtn").addEventListener("click", openAddLecturerModal);
  document.getElementById("lecturerForm").addEventListener("submit", handleLecturerFormSubmit);
  document.getElementById("confirmDeleteBtn").addEventListener("click", handleConfirmedDelete);
}

function renderLecturers() {
  const q = document.getElementById("lecturerSearch").value.trim().toLowerCase();
  const filtered = lecturers.filter(l =>
    !q || l.name.toLowerCase().includes(q) || l.staffId.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)
  );

  const tbody = document.getElementById("lecturersTbody");
  const empty = document.getElementById("lecturersEmpty");

  if (filtered.length === 0) { tbody.innerHTML = ""; empty.classList.remove("d-none"); return; }
  empty.classList.add("d-none");

  tbody.innerHTML = filtered.map(l => {
    const dept  = departments.find(d => String(d.id) === String(l.departmentId));
    const count = assignments.filter(a => String(a.lecturerId) === String(l.id)).length;
    const initials = l.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
    return `<tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <span class="student-avatar-mini">${initials}</span>
          <span class="fw-semibold">${l.name}</span>
        </div>
      </td>
      <td class="text-muted-cell">${l.staffId}</td>
      <td class="text-muted-cell">${l.email}</td>
      <td>${dept?.name ?? "—"}</td>
      <td>${count} assignment${count === 1 ? "" : "s"}</td>
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
  document.getElementById("lecturerModalTitle").textContent = `Edit — ${l.name}`;
  document.getElementById("lName").value       = l.name;
  document.getElementById("lStaffId").value    = l.staffId;
  document.getElementById("lEmail").value      = l.email;
  document.getElementById("lDepartment").value = l.departmentId;
  document.getElementById("lPasswordWrap").classList.remove("d-none");
  document.getElementById("lPassword").required = false;
  document.getElementById("lPassword").value    = "";
  hideAlert("lecturerFormAlert");
  lecturerModal.show();
}

async function handleLecturerFormSubmit(e) {
  e.preventDefault();
  hideAlert("lecturerFormAlert");

  const name       = document.getElementById("lName").value.trim();
  const staffId    = document.getElementById("lStaffId").value.trim().toUpperCase();
  const email      = document.getElementById("lEmail").value.trim();
  const deptId     = document.getElementById("lDepartment").value;
  const password   = document.getElementById("lPassword").value.trim();

  if (!name || !staffId || !email || !deptId) {
    showAlert("lecturerFormAlert", "Please fill in all required fields."); return;
  }

  // Duplicate staff ID check
  const dupStaff = lecturers.find(l =>
    l.staffId.toUpperCase() === staffId && String(l.id) !== String(editingLecturerId)
  );
  if (dupStaff) { showAlert("lecturerFormAlert", `Staff ID "${staffId}" already exists.`); return; }

  // Duplicate email check
  const dupEmail = lecturers.find(l =>
    l.email.toLowerCase() === email.toLowerCase() && String(l.id) !== String(editingLecturerId)
  );
  if (dupEmail) { showAlert("lecturerFormAlert", "A lecturer with this email already exists."); return; }

  const data = { name, staffId, email, departmentId: deptId, role: "lecturer" };

  if (editingLecturerId === null) {
    // New lecturer must have a password
    if (!password || password.length < 6) {
      showAlert("lecturerFormAlert", "Password must be at least 6 characters."); return;
    }
    data.password = password;
  } else if (password) {
    // If a password is provided on edit, update it
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
  } catch (err) {
    console.error(err);
    showAlert("lecturerFormAlert", "Failed to save. Please try again.");
  }
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
  document.getElementById("addAssignmentBtn").addEventListener("click", openAddAssignmentModal);
  document.getElementById("assignmentForm").addEventListener("submit", handleAssignmentFormSubmit);
}

function renderAssignments() {
  const tbody = document.getElementById("assignmentsTbody");
  const empty = document.getElementById("assignmentsEmpty");

  if (assignments.length === 0) { tbody.innerHTML = ""; empty.classList.remove("d-none"); return; }
  empty.classList.add("d-none");

  tbody.innerHTML = assignments.map(a => {
    const lecturer = lecturers.find(l => String(l.id) === String(a.lecturerId));
    const course   = courses.find(c => String(c.id) === String(a.courseId));
    return `<tr>
      <td class="fw-semibold">${lecturer ? lecturer.name : "Unknown"}</td>
      <td>${course ? course.courseCode + " — " + course.courseTitle : "Unknown"}</td>
      <td>${a.session}</td>
      <td>Sem ${a.semester}</td>
      <td class="text-end">
        <button class="btn btn-danger-soft btn-sm" data-action="delete" data-id="${a.id}" title="Remove">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-action='delete']").forEach(btn =>
    btn.addEventListener("click", () => confirmDeleteAssignment(btn.dataset.id))
  );
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
