import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import {
  getCourses, getDepartments, getFaculties, getStudents, getResults,
  createCourse, updateCourse, deleteCourse,
  createDepartment, updateDepartment, deleteDepartment,
  createFaculty, updateFaculty, deleteFaculty,
} from "../api.js";

requireAdminAuth();

/* ── State ──────────────────────────────────────────────── */
let admin = null;
let courses = [], departments = [], faculties = [], students = [], results = [];
let editingCourseId = null, editingDeptId = null, editingFacultyId = null;
let pendingDelete = null;   // { type, id }
let coursePage = 1;
const COURSE_PAGE_SIZE = 20;

/* ── DOM refs ───────────────────────────────────────────── */
const pageState   = document.getElementById("pageState");
const pageContent = document.getElementById("pageContent");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar  = document.getElementById("appSidebar");
const appSidebarScrim = document.getElementById("appSidebarScrim");
const logoutBtn   = document.getElementById("logoutBtn");

const courseModal = new bootstrap.Modal(document.getElementById("courseModal"));
const deptModal   = new bootstrap.Modal(document.getElementById("deptModal"));
const facultyModal = new bootstrap.Modal(document.getElementById("facultyModal"));
const deleteConfirmModal = new bootstrap.Modal(document.getElementById("deleteConfirmModal"));

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    admin = getCurrentAdmin();
    if (!admin) { window.location.href = "/assets/pages/admin/admin-login.html"; return; }
    setupSidebar(); setupLogout();
    await loadData();
    populateFacultySelects();
    pageState.classList.add("d-none");
    pageContent.classList.remove("d-none");
    bindTabs();
    bindCourseEvents();
    bindDeptEvents();
    bindFacultyEvents();
    renderCourses();
    renderDepts();
    renderFaculties();
  } catch (err) {
    console.error(err);
    pageState.innerHTML = `<div class="alert alert-danger mb-0">Failed to load data.</div>`;
  }
}

async function loadData() {
  [courses, departments, faculties, students, results] = await Promise.all([
    getCourses(), getDepartments(), getFaculties(), getStudents(), getResults(),
  ]);
  /* Ensure every course has a status field */
  courses = courses.map(c => ({ status: "active", ...c }));
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
    adminLogout(); window.location.href = "/assets/pages/admin/admin-login.html";
  });
}

/* ── Tabs ───────────────────────────────────────────────── */
function bindTabs() {
  document.getElementById("mainTabs").querySelectorAll(".nav-link").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("mainTabs").querySelectorAll(".nav-link").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("coursesTab").classList.toggle("d-none", tab !== "courses");
      document.getElementById("departmentsTab").classList.toggle("d-none", tab !== "departments");
      document.getElementById("facultiesTab").classList.toggle("d-none", tab !== "faculties");
    });
  });
}

/* ── Faculty selects population ─────────────────────────── */
function populateFacultySelects() {
  const opts = faculties.map(f => `<option value="${f.name}">${f.name}</option>`).join("");
  const optsFId = faculties.map(f => `<option value="${f.name}">${f.name}</option>`).join("");

  document.getElementById("cFilterFaculty").innerHTML = `<option value="">All Faculties</option>` + opts;
  document.getElementById("cFaculty").innerHTML = `<option value="">Select faculty…</option>` + optsFId;
  document.getElementById("dFaculty").innerHTML = `<option value="">Select faculty…</option>` + opts;

  /* Populate dept filter */
  document.getElementById("cFilterDept").innerHTML =
    `<option value="">All Departments</option>` +
    departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
}

function populateCourseModalDepts(facultyName) {
  const deptSel = document.getElementById("cDepartment");
  const depts = facultyName ? departments.filter(d => d.faculty === facultyName) : departments;
  deptSel.innerHTML = `<option value="">Select department…</option>` +
    depts.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  deptSel.disabled = !facultyName;
}

/* ════════════════════════════════════════════════════════
   COURSES
   ════════════════════════════════════════════════════════ */
function bindCourseEvents() {
  ["cFilterFaculty","cFilterDept","cFilterLevel","cFilterSemester","cFilterStatus"].forEach(id =>
    document.getElementById(id).addEventListener("change", () => { coursePage = 1; renderCourses(); })
  );
  document.getElementById("courseSearchInput").addEventListener("input", () => { coursePage = 1; renderCourses(); });
  document.getElementById("addCourseBtn").addEventListener("click", openAddCourseModal);
  document.getElementById("cFilterFaculty").addEventListener("change", onCourseFilterFacultyChange);
  document.getElementById("cFaculty").addEventListener("change", () =>
    populateCourseModalDepts(document.getElementById("cFaculty").value)
  );
  document.getElementById("courseForm").addEventListener("submit", handleCourseFormSubmit);
  document.getElementById("confirmDeleteBtn").addEventListener("click", handleConfirmedDelete);
  document.getElementById("archiveCourseBtn").addEventListener("click", handleArchiveCourse);
}

function onCourseFilterFacultyChange() {
  const faculty = document.getElementById("cFilterFaculty").value;
  document.getElementById("cFilterDept").innerHTML =
    `<option value="">All Departments</option>` +
    departments
      .filter(d => !faculty || d.faculty === faculty)
      .map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  coursePage = 1;
  renderCourses();
}

function getFilteredCourses() {
  const faculty   = document.getElementById("cFilterFaculty").value;
  const deptId    = document.getElementById("cFilterDept").value;
  const level     = document.getElementById("cFilterLevel").value;
  const semester  = document.getElementById("cFilterSemester").value;
  const status    = document.getElementById("cFilterStatus").value;
  const q         = document.getElementById("courseSearchInput").value.trim().toLowerCase();

  return courses.filter(c => {
    const dept = departments.find(d => String(d.id) === String(c.departmentId));
    const facultyMatch  = !faculty  || (dept && dept.faculty === faculty);
    const deptMatch     = !deptId   || String(c.departmentId) === String(deptId);
    const levelMatch    = !level    || Number(c.level) === Number(level);
    const semMatch      = !semester || Number(c.semester) === Number(semester);
    const statusMatch   = !status   || (c.status || "active") === status;
    const qMatch        = !q        || c.courseCode.toLowerCase().includes(q) || c.courseTitle.toLowerCase().includes(q);
    return facultyMatch && deptMatch && levelMatch && semMatch && statusMatch && qMatch;
  });
}

function renderCourses() {
  const filtered = getFilteredCourses();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / COURSE_PAGE_SIZE));
  if (coursePage > totalPages) coursePage = totalPages;
  const start = (coursePage - 1) * COURSE_PAGE_SIZE;
  const paged = filtered.slice(start, start + COURSE_PAGE_SIZE);

  document.getElementById("courseResultCount").textContent = `${total} course${total === 1 ? "" : "s"}`;
  document.getElementById("coursePaginationInfo").textContent =
    total ? `Showing ${start+1}–${Math.min(start+COURSE_PAGE_SIZE,total)} of ${total}` : "";

  const tbody = document.getElementById("coursesTbody");
  const empty = document.getElementById("coursesEmptyState");

  if (paged.length === 0) { tbody.innerHTML = ""; empty.classList.remove("d-none"); renderCoursePagination(0); return; }
  empty.classList.add("d-none");

  tbody.innerHTML = paged.map(c => {
    const dept = departments.find(d => String(d.id) === String(c.departmentId));
    const isArchived = (c.status || "active") === "archived";
    return `<tr class="${isArchived ? "table-secondary opacity-75" : ""}">
      <td class="fw-semibold">${c.courseCode}</td>
      <td>${c.courseTitle}</td>
      <td>${c.creditUnit}</td>
      <td>${c.level}</td>
      <td>Sem ${c.semester}</td>
      <td class="text-muted-cell">${dept?.name ?? "N/A"}</td>
      <td><span class="status-badge status-badge--${isArchived ? "pending" : "completed"}">${isArchived ? "Archived" : "Active"}</span></td>
      <td>
        <div class="admin-row-actions">
          <button class="btn btn-secondary-outline btn-sm" data-action="edit" data-id="${c.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-danger-soft btn-sm" data-action="delete" data-id="${c.id}" title="Delete/Archive"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-action='edit']").forEach(btn =>
    btn.addEventListener("click", () => openEditCourseModal(btn.dataset.id)));
  tbody.querySelectorAll("[data-action='delete']").forEach(btn =>
    btn.addEventListener("click", () => confirmDeleteCourse(btn.dataset.id)));

  renderCoursePagination(totalPages);
}

function renderCoursePagination(totalPages) {
  const list = document.getElementById("coursePaginationList");
  if (totalPages <= 1) { list.innerHTML = ""; return; }
  let html = `<li class="page-item${coursePage===1?" disabled":""}"><button class="page-link" data-page="${coursePage-1}">&lsaquo;</button></li>`;
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && Math.abs(i - coursePage) > 2 && i !== 1 && i !== totalPages) {
      if (i === 2 || i === totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      continue;
    }
    html += `<li class="page-item${i===coursePage?" active":""}"><button class="page-link" data-page="${i}">${i}</button></li>`;
  }
  html += `<li class="page-item${coursePage===totalPages?" disabled":""}"><button class="page-link" data-page="${coursePage+1}">&rsaquo;</button></li>`;
  list.innerHTML = html;
  list.querySelectorAll("[data-page]").forEach(btn =>
    btn.addEventListener("click", () => { coursePage = Number(btn.dataset.page); renderCourses(); }));
}

function openAddCourseModal() {
  editingCourseId = null;
  document.getElementById("courseModalTitle").textContent = "Add Course";
  document.getElementById("courseForm").reset();
  hideAlert("courseFormAlert");
  document.getElementById("cDepartment").disabled = true;
  courseModal.show();
}

function openEditCourseModal(id) {
  const c = courses.find(co => String(co.id) === String(id));
  if (!c) return;
  editingCourseId = id;
  document.getElementById("courseModalTitle").textContent = `Edit — ${c.courseCode}`;
  hideAlert("courseFormAlert");
  const dept = departments.find(d => String(d.id) === String(c.departmentId));
  document.getElementById("cFaculty").value = dept?.faculty || "";
  populateCourseModalDepts(dept?.faculty || "");
  document.getElementById("cCode").value      = c.courseCode;
  document.getElementById("cTitle").value     = c.courseTitle;
  document.getElementById("cCredit").value    = c.creditUnit;
  document.getElementById("cLevel").value     = c.level;
  document.getElementById("cSemester").value  = c.semester;
  document.getElementById("cStatus").value    = c.status || "active";
  document.getElementById("cDepartment").value = c.departmentId;
  courseModal.show();
}

async function handleCourseFormSubmit(e) {
  e.preventDefault();
  hideAlert("courseFormAlert");
  const code  = document.getElementById("cCode").value.trim().toUpperCase();
  const title = document.getElementById("cTitle").value.trim();
  const deptId = document.getElementById("cDepartment").value;

  if (!code || !title || !deptId) { showAlert("courseFormAlert", "Please fill in all required fields."); return; }

  /* Duplicate code check */
  const dupCode = courses.find(c => c.courseCode.toUpperCase() === code && String(c.id) !== String(editingCourseId));
  if (dupCode) { showAlert("courseFormAlert", `Course code "${code}" already exists.`); return; }

  /* Duplicate title within same dept+level+semester */
  const level = Number(document.getElementById("cLevel").value);
  const sem   = Number(document.getElementById("cSemester").value);
  const dupTitle = courses.find(c =>
    c.courseTitle.toLowerCase() === title.toLowerCase() &&
    String(c.departmentId) === String(deptId) &&
    Number(c.level) === level &&
    Number(c.semester) === sem &&
    String(c.id) !== String(editingCourseId)
  );
  if (dupTitle) { showAlert("courseFormAlert", `A course with this title already exists in this department/level/semester.`); return; }

  const data = {
    courseCode: code, courseTitle: title,
    creditUnit: Number(document.getElementById("cCredit").value),
    level, semester: sem, departmentId: deptId,
    status: document.getElementById("cStatus").value,
  };

  try {
    if (editingCourseId === null) {
      const created = await createCourse(data);
      courses.push({ status: "active", ...created });
    } else {
      const updated = await updateCourse(editingCourseId, data);
      const idx = courses.findIndex(c => String(c.id) === String(editingCourseId));
      courses[idx] = { ...courses[idx], ...updated };
    }
    courseModal.hide();
    renderCourses();
  } catch (err) {
    console.error(err);
    showAlert("courseFormAlert", "Failed to save course. Please try again.");
  }
}

function confirmDeleteCourse(id) {
  const c = courses.find(co => String(co.id) === String(id));
  if (!c) return;
  const hasResults = results.some(r => String(r.courseId) === String(id));
  pendingDelete = { type: "course", id };

  const archiveBtn = document.getElementById("archiveCourseBtn");
  const deleteBtn  = document.getElementById("confirmDeleteBtn");

  if (hasResults) {
    document.getElementById("deleteConfirmTitle").textContent = "Cannot Permanently Delete";
    document.getElementById("deleteConfirmBody").textContent =
      `"${c.courseCode} — ${c.courseTitle}" has existing results linked to it. You can archive it to hide it from active lists, or cancel.`;
    deleteBtn.style.display = "none";
    archiveBtn.style.display = "";
  } else {
    document.getElementById("deleteConfirmTitle").textContent = "Delete this course?";
    document.getElementById("deleteConfirmBody").textContent =
      `This will permanently remove "${c.courseCode} — ${c.courseTitle}". This cannot be undone.`;
    deleteBtn.style.display = "";
    archiveBtn.style.display = "none";
  }
  deleteConfirmModal.show();
}

async function handleArchiveCourse() {
  if (!pendingDelete || pendingDelete.type !== "course") return;
  try {
    const updated = await updateCourse(pendingDelete.id, { status: "archived" });
    const idx = courses.findIndex(c => String(c.id) === String(pendingDelete.id));
    courses[idx] = { ...courses[idx], ...updated, status: "archived" };
    deleteConfirmModal.hide();
    renderCourses();
  } catch (err) {
    console.error(err);
    alert("Failed to archive course.");
  } finally { pendingDelete = null; }
}

/* ════════════════════════════════════════════════════════
   DEPARTMENTS
   ════════════════════════════════════════════════════════ */
function bindDeptEvents() {
  document.getElementById("deptSearchInput").addEventListener("input", renderDepts);
  document.getElementById("addDeptBtn").addEventListener("click", openAddDeptModal);
  document.getElementById("deptForm").addEventListener("submit", handleDeptFormSubmit);
}

function renderDepts() {
  const q = document.getElementById("deptSearchInput").value.trim().toLowerCase();
  const filtered = departments.filter(d =>
    !q || d.name.toLowerCase().includes(q) || d.faculty.toLowerCase().includes(q)
  );
  const tbody = document.getElementById("deptsTbody");
  const empty = document.getElementById("deptsEmptyState");

  if (filtered.length === 0) { tbody.innerHTML = ""; empty.classList.remove("d-none"); return; }
  empty.classList.add("d-none");

  tbody.innerHTML = filtered.map(d => {
    const sc = students.filter(s => String(s.departmentId) === String(d.id)).length;
    const cc = courses.filter(c => String(c.departmentId) === String(d.id)).length;
    return `<tr>
      <td class="fw-semibold">${d.name}</td>
      <td class="text-muted-cell">${d.faculty}</td>
      <td>${sc}</td><td>${cc}</td>
      <td>
        <div class="admin-row-actions">
          <button class="btn btn-secondary-outline btn-sm" data-action="edit" data-id="${d.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-danger-soft btn-sm" data-action="delete" data-id="${d.id}" title="Delete"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-action='edit']").forEach(btn =>
    btn.addEventListener("click", () => openEditDeptModal(btn.dataset.id)));
  tbody.querySelectorAll("[data-action='delete']").forEach(btn =>
    btn.addEventListener("click", () => confirmDeleteDept(btn.dataset.id)));
}

function openAddDeptModal() {
  editingDeptId = null;
  document.getElementById("deptModalTitle").textContent = "Add Department";
  document.getElementById("deptForm").reset();
  document.getElementById("dFaculty").innerHTML =
    `<option value="">Select faculty…</option>` +
    faculties.map(f => `<option value="${f.name}">${f.name}</option>`).join("");
  hideAlert("deptFormAlert");
  deptModal.show();
}

function openEditDeptModal(id) {
  const d = departments.find(dep => String(dep.id) === String(id));
  if (!d) return;
  editingDeptId = id;
  document.getElementById("deptModalTitle").textContent = `Edit — ${d.name}`;
  document.getElementById("dFaculty").innerHTML =
    `<option value="">Select faculty…</option>` +
    faculties.map(f => `<option value="${f.name}">${f.name}</option>`).join("");
  document.getElementById("dName").value   = d.name;
  document.getElementById("dFaculty").value = d.faculty;
  hideAlert("deptFormAlert");
  deptModal.show();
}

async function handleDeptFormSubmit(e) {
  e.preventDefault();
  hideAlert("deptFormAlert");
  const name    = document.getElementById("dName").value.trim();
  const faculty = document.getElementById("dFaculty").value;
  if (!name || !faculty) { showAlert("deptFormAlert", "Please fill in all fields."); return; }

  const dup = departments.find(d =>
    d.name.toLowerCase() === name.toLowerCase() && String(d.id) !== String(editingDeptId));
  if (dup) { showAlert("deptFormAlert", "A department with this name already exists."); return; }

  try {
    if (editingDeptId === null) {
      const created = await createDepartment({ name, faculty });
      departments.push(created);
    } else {
      const updated = await updateDepartment(editingDeptId, { name, faculty });
      const idx = departments.findIndex(d => String(d.id) === String(editingDeptId));
      departments[idx] = { ...departments[idx], ...updated };
    }
    deptModal.hide();
    populateFacultySelects();
    renderDepts(); renderCourses();
  } catch (err) {
    console.error(err); showAlert("deptFormAlert", "Failed to save department.");
  }
}

function confirmDeleteDept(id) {
  const d = departments.find(dep => String(dep.id) === String(id));
  if (!d) return;
  const sc = students.filter(s => String(s.departmentId) === String(id)).length;
  const cc = courses.filter(c => String(c.departmentId) === String(id)).length;

  pendingDelete = { type: "department", id };
  document.getElementById("archiveCourseBtn").style.display = "none";
  const deleteBtn = document.getElementById("confirmDeleteBtn");

  if (sc > 0 || cc > 0) {
    document.getElementById("deleteConfirmTitle").textContent = "Cannot Delete Department";
    document.getElementById("deleteConfirmBody").textContent =
      `"${d.name}" still has ${sc} student(s) and ${cc} course(s). Reassign or remove them first.`;
    deleteBtn.style.display = "none";
  } else {
    document.getElementById("deleteConfirmTitle").textContent = "Delete this department?";
    document.getElementById("deleteConfirmBody").textContent =
      `This will permanently remove "${d.name}". This cannot be undone.`;
    deleteBtn.style.display = "";
  }
  deleteConfirmModal.show();
}

/* ════════════════════════════════════════════════════════
   FACULTIES
   ════════════════════════════════════════════════════════ */
function bindFacultyEvents() {
  document.getElementById("facultySearchInput").addEventListener("input", renderFaculties);
  document.getElementById("addFacultyBtn").addEventListener("click", openAddFacultyModal);
  document.getElementById("facultyForm").addEventListener("submit", handleFacultyFormSubmit);
}

function renderFaculties() {
  const q = document.getElementById("facultySearchInput").value.trim().toLowerCase();
  const filtered = faculties.filter(f => !q || f.name.toLowerCase().includes(q));
  const tbody = document.getElementById("facultiesTbody");
  const empty = document.getElementById("facultiesEmptyState");

  if (filtered.length === 0) { tbody.innerHTML = ""; empty.classList.remove("d-none"); return; }
  empty.classList.add("d-none");

  tbody.innerHTML = filtered.map(f => {
    const deptCount    = departments.filter(d => d.faculty === f.name).length;
    const studentCount = students.filter(s => {
      const dept = departments.find(d => String(d.id) === String(s.departmentId));
      return dept && dept.faculty === f.name;
    }).length;
    return `<tr>
      <td class="fw-semibold">${f.name}</td>
      <td>${deptCount}</td>
      <td>${studentCount}</td>
      <td>
        <div class="admin-row-actions">
          <button class="btn btn-secondary-outline btn-sm" data-action="edit" data-id="${f.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-danger-soft btn-sm" data-action="delete" data-id="${f.id}" title="Delete"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-action='edit']").forEach(btn =>
    btn.addEventListener("click", () => openEditFacultyModal(btn.dataset.id)));
  tbody.querySelectorAll("[data-action='delete']").forEach(btn =>
    btn.addEventListener("click", () => confirmDeleteFaculty(btn.dataset.id)));
}

function openAddFacultyModal() {
  editingFacultyId = null;
  document.getElementById("facultyModalTitle").textContent = "Add Faculty";
  document.getElementById("facultyForm").reset();
  document.getElementById("firstDeptSection").classList.remove("d-none");
  document.getElementById("fFirstDept").required = true;
  hideAlert("facultyFormAlert");
  facultyModal.show();
}

function openEditFacultyModal(id) {
  const f = faculties.find(fa => String(fa.id) === String(id));
  if (!f) return;
  editingFacultyId = id;
  document.getElementById("facultyModalTitle").textContent = `Edit — ${f.name}`;
  document.getElementById("fName").value = f.name;
  document.getElementById("firstDeptSection").classList.add("d-none");
  document.getElementById("fFirstDept").required = false;
  hideAlert("facultyFormAlert");
  facultyModal.show();
}

async function handleFacultyFormSubmit(e) {
  e.preventDefault();
  hideAlert("facultyFormAlert");
  const name = document.getElementById("fName").value.trim();
  if (!name) { showAlert("facultyFormAlert", "Faculty name is required."); return; }

  const dup = faculties.find(f => f.name.toLowerCase() === name.toLowerCase() && String(f.id) !== String(editingFacultyId));
  if (dup) { showAlert("facultyFormAlert", "A faculty with this name already exists."); return; }

  try {
    if (editingFacultyId === null) {
      const firstDept = document.getElementById("fFirstDept").value.trim();
      if (!firstDept) { showAlert("facultyFormAlert", "Please provide at least one department name."); return; }
      const created = await createFaculty({ name });
      faculties.push(created);
      await createDepartment({ name: firstDept, faculty: name });
      const depts = await getDepartments_local();
      departments.length = 0;
      depts.forEach(d => departments.push(d));
    } else {
      const oldName = faculties.find(f => String(f.id) === String(editingFacultyId))?.name;
      const updated = await updateFaculty(editingFacultyId, { name });
      const idx = faculties.findIndex(f => String(f.id) === String(editingFacultyId));
      faculties[idx] = { ...faculties[idx], ...updated };
      /* Update all departments that referenced old name */
      if (oldName && oldName !== name) {
        const affected = departments.filter(d => d.faculty === oldName);
        for (const d of affected) {
          const upd = await import("../api.js").then(m => m.updateDepartment(d.id, { faculty: name }));
          const di = departments.findIndex(dep => String(dep.id) === String(d.id));
          departments[di] = { ...departments[di], ...upd };
        }
      }
    }
    facultyModal.hide();
    populateFacultySelects();
    renderFaculties(); renderDepts(); renderCourses();
  } catch (err) {
    console.error(err); showAlert("facultyFormAlert", "Failed to save faculty. Please try again.");
  }
}

async function getDepartments_local() {
  const { getDepartments } = await import("../api.js");
  return getDepartments();
}

function confirmDeleteFaculty(id) {
  const f = faculties.find(fa => String(fa.id) === String(id));
  if (!f) return;
  const deptCount = departments.filter(d => d.faculty === f.name).length;
  pendingDelete = { type: "faculty", id };
  document.getElementById("archiveCourseBtn").style.display = "none";
  const deleteBtn = document.getElementById("confirmDeleteBtn");
  if (deptCount > 0) {
    document.getElementById("deleteConfirmTitle").textContent = "Cannot Delete Faculty";
    document.getElementById("deleteConfirmBody").textContent =
      `"${f.name}" still has ${deptCount} department(s). Remove or reassign them first.`;
    deleteBtn.style.display = "none";
  } else {
    document.getElementById("deleteConfirmTitle").textContent = "Delete this faculty?";
    document.getElementById("deleteConfirmBody").textContent =
      `This will permanently remove "${f.name}". This cannot be undone.`;
    deleteBtn.style.display = "";
  }
  deleteConfirmModal.show();
}

/* ── Shared delete handler ──────────────────────────────── */
async function handleConfirmedDelete() {
  if (!pendingDelete) return;
  try {
    if (pendingDelete.type === "course") {
      await deleteCourse(pendingDelete.id);
      courses = courses.filter(c => String(c.id) !== String(pendingDelete.id));
      renderCourses();
    } else if (pendingDelete.type === "department") {
      await deleteDepartment(pendingDelete.id);
      departments = departments.filter(d => String(d.id) !== String(pendingDelete.id));
      populateFacultySelects(); renderDepts(); renderCourses();
    } else if (pendingDelete.type === "faculty") {
      await deleteFaculty(pendingDelete.id);
      faculties = faculties.filter(f => String(f.id) !== String(pendingDelete.id));
      populateFacultySelects(); renderFaculties(); renderDepts();
    }
    deleteConfirmModal.hide();
  } catch (err) {
    console.error(err); alert("Failed to delete. Please try again.");
  } finally {
    pendingDelete = null;
    document.getElementById("confirmDeleteBtn").style.display = "";
    document.getElementById("archiveCourseBtn").style.display = "none";
  }
}

/* ── Helpers ────────────────────────────────────────────── */
function showAlert(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.remove("d-none"); }
function hideAlert(id)      { const el = document.getElementById(id); el.textContent = "";  el.classList.add("d-none"); }
