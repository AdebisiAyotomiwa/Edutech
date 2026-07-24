import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import {
  getStudents, getDepartments, getFaculties,
  createStudent, updateStudent, deleteStudent, resetStudentPassword,
} from "../api.js";

requireAdminAuth();

/* ── State ──────────────────────────────────────────────── */
let admin = null;
let students = [], departments = [], faculties = [];
let filteredStudents = [];
let currentPage = 1;
const PAGE_SIZE = 15;
let editingStudentId = null;
let resetPasswordStudentId = null;
let deleteStudentId = null;
let viewingStudentId = null;

/* ── DOM refs ───────────────────────────────────────────── */
const pageState    = document.getElementById("pageState");
const pageContent  = document.getElementById("pageContent");
const filterFaculty = document.getElementById("filterFaculty");
const filterDept    = document.getElementById("filterDept");
const filterLevel   = document.getElementById("filterLevel");
const filterStatus  = document.getElementById("filterStatus");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");
const filterPrompt  = document.getElementById("filterPrompt");
const studentListArea = document.getElementById("studentListArea");
const searchInput   = document.getElementById("searchInput");
const resultCount   = document.getElementById("resultCount");
const studentsTbody = document.getElementById("studentsTbody");
const emptyState    = document.getElementById("emptyState");
const paginationInfo = document.getElementById("paginationInfo");
const paginationList = document.getElementById("paginationList");
const addStudentBtn = document.getElementById("addStudentBtn");

const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar       = document.getElementById("appSidebar");
const appSidebarScrim  = document.getElementById("appSidebarScrim");
const logoutBtn        = document.getElementById("logoutBtn");

/* Modals */
const studentModal        = new bootstrap.Modal(document.getElementById("studentModal"));
const viewStudentModal    = new bootstrap.Modal(document.getElementById("viewStudentModal"));
const resetPasswordModal  = new bootstrap.Modal(document.getElementById("resetPasswordModal"));
const deleteStudentModal  = new bootstrap.Modal(document.getElementById("deleteStudentModal"));

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    admin = getCurrentAdmin();
    if (!admin) { window.location.href = "/assets/pages/admin/admin-login.html"; return; }
    setupSidebar();
    setupLogout();
    await loadData();
    populateStaticSelects();
    pageState.classList.add("d-none");
    pageContent.classList.remove("d-none");
    bindEvents();
  } catch (err) {
    console.error(err);
    pageState.innerHTML = `<div class="alert alert-danger mb-0">Failed to load students.</div>`;
  }
}

async function loadData() {
  [students, departments, faculties] = await Promise.all([
    getStudents(), getDepartments(), getFaculties(),
  ]);
}

/* ── Sidebar / logout ───────────────────────────────────── */
function setupSidebar() {
  document.getElementById("sidebarUserName").textContent = admin.name || "Admin";
  document.getElementById("sidebarUserMeta").textContent = admin.email;
  document.getElementById("sidebarAvatarInitials").textContent =
    (admin.name || "A").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
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

/* ── Static selects (Faculty filter + form) ─────────────── */
function populateStaticSelects() {
  filterFaculty.innerHTML =
    `<option value="">Select Faculty</option>` +
    faculties.map(f => `<option value="${f.name}">${f.name}</option>`).join("");

  document.getElementById("fFaculty").innerHTML =
    `<option value="">Select faculty…</option>` +
    faculties.map(f => `<option value="${f.name}">${f.name}</option>`).join("");
}

/* ── Event wiring ───────────────────────────────────────── */
function bindEvents() {
  /* Hierarchy filters */
  filterFaculty.addEventListener("change", onFacultyChange);
  filterDept.addEventListener("change", onDeptChange);
  filterLevel.addEventListener("change", applyFiltersAndRender);
  filterStatus.addEventListener("change", applyFiltersAndRender);
  clearFiltersBtn.addEventListener("click", clearFilters);
  searchInput.addEventListener("input", () => { currentPage = 1; renderTable(); });

  /* Add student */
  addStudentBtn.addEventListener("click", openAddModal);

  /* Modal faculty → dept cascade */
  document.getElementById("fFaculty").addEventListener("change", onModalFacultyChange);
  document.getElementById("fDepartment").addEventListener("change", onModalDeptChange);

  /* Form submits */
  document.getElementById("studentForm").addEventListener("submit", handleStudentFormSubmit);
  document.getElementById("resetPasswordForm").addEventListener("submit", handleResetPasswordSubmit);
  document.getElementById("confirmDeleteStudentBtn").addEventListener("click", handleDeleteConfirm);
  document.getElementById("viewToEditBtn").addEventListener("click", () => {
    viewStudentModal.hide();
    openEditModal(viewingStudentId);
  });
}

function onFacultyChange() {
  const faculty = filterFaculty.value;
  filterDept.innerHTML = `<option value="">Select Department</option>` +
    departments
      .filter(d => !faculty || d.faculty === faculty)
      .map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  filterDept.disabled = !faculty;
  filterLevel.value = ""; filterLevel.disabled = true;
  filterStatus.value = ""; filterStatus.disabled = true;
  studentListArea.classList.add("d-none");
  filterPrompt.classList.remove("d-none");
}

function onDeptChange() {
  const hasDept = !!filterDept.value;
  filterLevel.disabled = !hasDept;
  filterStatus.disabled = !hasDept;
  if (!hasDept) {
    filterLevel.value = ""; filterStatus.value = "";
    studentListArea.classList.add("d-none");
    filterPrompt.classList.remove("d-none");
    return;
  }
  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  const dept   = filterDept.value;
  const level  = filterLevel.value;
  const status = filterStatus.value;

  if (!dept) {
    studentListArea.classList.add("d-none");
    filterPrompt.classList.remove("d-none");
    return;
  }

  filterPrompt.classList.add("d-none");
  studentListArea.classList.remove("d-none");

  filteredStudents = students.filter(s => {
    const deptMatch   = String(s.departmentId) === String(dept);
    const levelMatch  = !level  || Number(s.level) === Number(level);
    const statusMatch = !status || s.status === status;
    return deptMatch && levelMatch && statusMatch;
  });

  currentPage = 1;
  renderTable();
}

function clearFilters() {
  filterFaculty.value = "";
  filterDept.innerHTML = `<option value="">Select Department</option>`;
  filterDept.disabled = true;
  filterLevel.value = ""; filterLevel.disabled = true;
  filterStatus.value = ""; filterStatus.disabled = true;
  searchInput.value = "";
  studentListArea.classList.add("d-none");
  filterPrompt.classList.remove("d-none");
}

/* ── Render table ───────────────────────────────────────── */
function renderTable() {
  const q = searchInput.value.trim().toLowerCase();
  const searched = q
    ? filteredStudents.filter(s =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
        s.matricNumber.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q))
    : filteredStudents;

  resultCount.textContent = `${searched.length} student${searched.length === 1 ? "" : "s"}`;

  const totalPages = Math.max(1, Math.ceil(searched.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start  = (currentPage - 1) * PAGE_SIZE;
  const paged  = searched.slice(start, start + PAGE_SIZE);

  paginationInfo.textContent =
    searched.length === 0 ? "" :
    `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, searched.length)} of ${searched.length}`;

  if (paged.length === 0) {
    studentsTbody.innerHTML = "";
    emptyState.classList.remove("d-none");
    paginationList.innerHTML = "";
    return;
  }
  emptyState.classList.add("d-none");

  studentsTbody.innerHTML = paged.map(s => {
    const dept    = departments.find(d => String(d.id) === String(s.departmentId));
    const initials = (s.firstName[0] + s.lastName[0]).toUpperCase();
    const statusCls = s.status === "Active" ? "completed" : s.status === "Graduated" ? "info" : "pending";
    return `<tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <span class="student-avatar-mini">${initials}</span>
          <div>
            <div class="fw-semibold">${s.firstName} ${s.lastName}</div>
            <div class="text-muted-cell">${s.email}</div>
          </div>
        </div>
      </td>
      <td>${s.matricNumber}</td>
      <td class="text-muted-cell">${s.programme || (dept?.name ?? "—")}</td>
      <td>${s.level} Level</td>
      <td><span class="status-badge status-badge--${statusCls}">${s.status}</span></td>
      <td>
        <div class="admin-row-actions">
          <button class="btn btn-secondary-outline btn-sm" data-action="view"  data-id="${s.id}" title="View"><i class="bi bi-eye"></i></button>
          <button class="btn btn-secondary-outline btn-sm" data-action="edit"  data-id="${s.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-secondary-outline btn-sm" data-action="reset" data-id="${s.id}" title="Reset Password"><i class="bi bi-key"></i></button>
          <button class="btn btn-danger-soft btn-sm"       data-action="delete" data-id="${s.id}" title="Delete"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join("");

  /* Bind row actions */
  studentsTbody.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const { action, id } = btn.dataset;
      if (action === "view")   openViewModal(id);
      if (action === "edit")   openEditModal(id);
      if (action === "reset")  openResetPasswordModal(id);
      if (action === "delete") openDeleteModal(id);
    });
  });

  renderPagination(totalPages, searched.length);
}

function renderPagination(totalPages) {
  if (totalPages <= 1) { paginationList.innerHTML = ""; return; }
  let html = "";
  html += `<li class="page-item${currentPage === 1 ? " disabled" : ""}">
    <button class="page-link" data-page="${currentPage - 1}">&lsaquo;</button></li>`;
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== totalPages) {
      if (i === 2 || i === totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      continue;
    }
    html += `<li class="page-item${i === currentPage ? " active" : ""}">
      <button class="page-link" data-page="${i}">${i}</button></li>`;
  }
  html += `<li class="page-item${currentPage === totalPages ? " disabled" : ""}">
    <button class="page-link" data-page="${currentPage + 1}">&rsaquo;</button></li>`;
  paginationList.innerHTML = html;
  paginationList.querySelectorAll("[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentPage = Number(btn.dataset.page);
      renderTable();
    });
  });
}

/* ── View Modal ─────────────────────────────────────────── */
function openViewModal(id) {
  const s = students.find(st => String(st.id) === String(id));
  if (!s) return;
  viewingStudentId = id;
  const dept = departments.find(d => String(d.id) === String(s.departmentId));
  document.getElementById("viewStudentBody").innerHTML = `
    <div class="row g-3">
      <div class="col-12 text-center mb-2">
        <div class="student-avatar-lg mx-auto mb-2">${(s.firstName[0]+s.lastName[0]).toUpperCase()}</div>
        <h5 class="fw-semibold mb-0">${s.firstName} ${s.lastName}${s.otherName ? " "+s.otherName : ""}</h5>
        <div class="text-muted">${s.matricNumber}</div>
      </div>
      ${viewField("Email", s.email)} ${viewField("Phone", s.phone)}
      ${viewField("Gender", s.gender)} ${viewField("Status", s.status)}
      ${viewField("Department", dept?.name ?? "N/A")} ${viewField("Faculty", dept?.faculty ?? "N/A")}
      ${viewField("Programme", s.programme)} ${viewField("Level", s.level+" Level")}
      ${viewField("Admission Year", s.admissionYear)}
    </div>`;
  viewStudentModal.show();
}

function viewField(label, value) {
  return `<div class="col-6 col-md-4">
    <div class="text-muted small fw-semibold">${label}</div>
    <div class="fw-medium">${value || "—"}</div>
  </div>`;
}

/* ── Add / Edit Modal ───────────────────────────────────── */
function openAddModal() {
  editingStudentId = null;
  document.getElementById("studentModalTitle").textContent = "Add Student";
  document.getElementById("studentForm").reset();
  hideAlert("studentFormAlert");
  document.getElementById("fPasswordWrap").classList.remove("d-none");
  document.getElementById("fPasswordSpacer").classList.remove("d-none");
  document.getElementById("fPassword").required = true;
  document.getElementById("fFaculty").value = "";
  resetModalDeptDropdown();
  studentModal.show();
}

function openEditModal(id) {
  const s = students.find(st => String(st.id) === String(id));
  if (!s) return;
  editingStudentId = id;
  document.getElementById("studentModalTitle").textContent = `Edit — ${s.firstName} ${s.lastName}`;
  hideAlert("studentFormAlert");

  const dept = departments.find(d => String(d.id) === String(s.departmentId));

  document.getElementById("fFirstName").value     = s.firstName;
  document.getElementById("fLastName").value      = s.lastName;
  document.getElementById("fOtherName").value     = s.otherName || "";
  document.getElementById("fMatric").value        = s.matricNumber;
  document.getElementById("fEmail").value         = s.email;
  document.getElementById("fPhone").value         = s.phone || "";
  document.getElementById("fGender").value        = s.gender;
  document.getElementById("fAdmissionYear").value = s.admissionYear;
  document.getElementById("fStatus").value        = s.status;

  /* Faculty → dept cascade */
  const fFaculty = document.getElementById("fFaculty");
  fFaculty.value = dept?.faculty || "";
  populateModalDepts(dept?.faculty || "");
  document.getElementById("fDepartment").value = s.departmentId;
  populateModalProgrammes(s.departmentId);
  document.getElementById("fProgramme").value = s.programme || "";
  document.getElementById("fLevel").value = s.level;

  /* Hide password in edit mode */
  document.getElementById("fPasswordWrap").classList.add("d-none");
  document.getElementById("fPasswordSpacer").classList.add("d-none");
  document.getElementById("fPassword").required = false;
  document.getElementById("fPassword").value = "";

  studentModal.show();
}

/* ── Modal cascades ─────────────────────────────────────── */
function onModalFacultyChange() {
  const faculty = document.getElementById("fFaculty").value;
  populateModalDepts(faculty);
  document.getElementById("fProgramme").innerHTML = `<option value="">Select programme…</option>`;
  document.getElementById("fProgramme").disabled = true;
}

function populateModalDepts(faculty) {
  const deptSel = document.getElementById("fDepartment");
  const depts = faculty ? departments.filter(d => d.faculty === faculty) : departments;
  deptSel.innerHTML = `<option value="">Select department…</option>` +
    depts.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  deptSel.disabled = !faculty;
}

function resetModalDeptDropdown() {
  const deptSel = document.getElementById("fDepartment");
  deptSel.innerHTML = `<option value="">Select department…</option>`;
  deptSel.disabled = true;
  document.getElementById("fProgramme").innerHTML = `<option value="">Select programme…</option>`;
  document.getElementById("fProgramme").disabled = true;
}

function onModalDeptChange() {
  const deptId = document.getElementById("fDepartment").value;
  populateModalProgrammes(deptId);
}

function populateModalProgrammes(deptId) {
  const progSel = document.getElementById("fProgramme");
  if (!deptId) {
    progSel.innerHTML = `<option value="">Select programme…</option>`;
    progSel.disabled = true;
    return;
  }
  /* Derive programmes from existing students in this dept */
  const programmes = [...new Set(
    students
      .filter(s => String(s.departmentId) === String(deptId) && s.programme)
      .map(s => s.programme)
  )].sort();

  if (programmes.length === 0) {
    /* Allow free text if no existing programmes */
    const dept = departments.find(d => String(d.id) === String(deptId));
    progSel.innerHTML = `<option value="${dept?.name || ""}">B.Sc / B.Eng — ${dept?.name || "Unknown"}</option>`;
  } else {
    progSel.innerHTML = `<option value="">Select programme…</option>` +
      programmes.map(p => `<option value="${p}">${p}</option>`).join("");
  }
  progSel.disabled = false;
}

/* ── Form submit ────────────────────────────────────────── */
async function handleStudentFormSubmit(e) {
  e.preventDefault();
  hideAlert("studentFormAlert");

  const spinner = document.getElementById("studentFormSpinner");
  const btn     = document.getElementById("studentFormSubmit");

  const data = {
    firstName:     document.getElementById("fFirstName").value.trim(),
    lastName:      document.getElementById("fLastName").value.trim(),
    otherName:     document.getElementById("fOtherName").value.trim(),
    matricNumber:  document.getElementById("fMatric").value.trim(),
    email:         document.getElementById("fEmail").value.trim(),
    phone:         document.getElementById("fPhone").value.trim(),
    gender:        document.getElementById("fGender").value,
    departmentId:  document.getElementById("fDepartment").value,
    level:         Number(document.getElementById("fLevel").value),
    programme:     document.getElementById("fProgramme").value.trim(),
    admissionYear: Number(document.getElementById("fAdmissionYear").value),
    status:        document.getElementById("fStatus").value,
  };

  /* Basic validation */
  if (!data.firstName || !data.lastName || !data.matricNumber || !data.email ||
      !data.phone || !data.gender || !data.departmentId || !data.level ||
      !data.programme || !data.admissionYear) {
    showAlert("studentFormAlert", "Please fill in all required fields.");
    return;
  }

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRx.test(data.email)) {
    showAlert("studentFormAlert", "Please enter a valid email address.");
    return;
  }

  /* Duplicate checks */
  const dupMatric = students.find(s =>
    s.matricNumber.toLowerCase() === data.matricNumber.toLowerCase() &&
    String(s.id) !== String(editingStudentId));
  if (dupMatric) { showAlert("studentFormAlert", "A student with this matric number already exists."); return; }

  const dupEmail = students.find(s =>
    s.email.toLowerCase() === data.email.toLowerCase() &&
    String(s.id) !== String(editingStudentId));
  if (dupEmail) { showAlert("studentFormAlert", "A student with this email already exists."); return; }

  spinner.classList.remove("d-none");
  btn.disabled = true;

  try {
    if (editingStudentId === null) {
      const password = document.getElementById("fPassword").value.trim();
      if (!password || password.length < 6) {
        showAlert("studentFormAlert", "Initial password must be at least 6 characters.");
        return;
      }
      const created = await createStudent({ ...data, password, profileImage: "" });
      students.push(created);
    } else {
      const updated = await updateStudent(editingStudentId, data);
      const idx = students.findIndex(s => String(s.id) === String(editingStudentId));
      students[idx] = { ...students[idx], ...updated };
    }
    studentModal.hide();
    applyFiltersAndRender();
  } catch (err) {
    console.error(err);
    showAlert("studentFormAlert", "Something went wrong. Please try again.");
  } finally {
    spinner.classList.add("d-none");
    btn.disabled = false;
  }
}

/* ── Reset password ─────────────────────────────────────── */
function openResetPasswordModal(id) {
  const s = students.find(st => String(st.id) === String(id));
  if (!s) return;
  resetPasswordStudentId = id;
  document.getElementById("resetPasswordStudentName").textContent = `${s.firstName} ${s.lastName}`;
  document.getElementById("resetPasswordForm").reset();
  hideAlert("resetPasswordAlert");
  resetPasswordModal.show();
}

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  const pw = document.getElementById("newPasswordInput").value.trim();
  if (pw.length < 6) {
    showAlert("resetPasswordAlert", "Password must be at least 6 characters.");
    return;
  }
  try {
    await resetStudentPassword(resetPasswordStudentId, pw);
    resetPasswordModal.hide();
  } catch (err) {
    console.error(err);
    showAlert("resetPasswordAlert", "Failed to reset password. Please try again.");
  }
}

/* ── Delete ─────────────────────────────────────────────── */
function openDeleteModal(id) {
  const s = students.find(st => String(st.id) === String(id));
  if (!s) return;
  deleteStudentId = id;
  document.getElementById("deleteStudentBody").textContent =
    `This will permanently remove ${s.firstName} ${s.lastName} (${s.matricNumber}). This cannot be undone.`;
  deleteStudentModal.show();
}

async function handleDeleteConfirm() {
  try {
    await deleteStudent(deleteStudentId);
    students = students.filter(s => String(s.id) !== String(deleteStudentId));
    deleteStudentModal.hide();
    applyFiltersAndRender();
  } catch (err) {
    console.error(err);
    alert("Failed to delete student. Please try again.");
  }
}

/* ── Helpers ────────────────────────────────────────────── */
function showAlert(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove("d-none");
}
function hideAlert(id) {
  const el = document.getElementById(id);
  el.textContent = "";
  el.classList.add("d-none");
}
