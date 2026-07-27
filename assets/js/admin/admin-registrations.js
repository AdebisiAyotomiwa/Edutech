import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import {
  getStudents, getDepartments, getFaculties, getCourses,
  getRegistrations, getAcademicCalendar,
  createRegistration, deleteRegistration,
} from "../api.js";

requireAdminAuth();

/* ── State ──────────────────────────────────────────────── */
let admin = null;
let students = [], departments = [], faculties = [], courses = [];
let registrations = [], calendar = null;
let allSessions = [];

/* Current tab */
let currSelectedStudentId = null;
let currStudentRegs = [];     // live regs for the open student
let currPage = 1;
const PAGE_SIZE = 15;
let pendingDeleteRegId = null;

/* History tab */
let histData = [];
let histPage = 1;

/* ── DOM refs ───────────────────────────────────────────── */
const pageState   = document.getElementById("pageState");
const pageContent = document.getElementById("pageContent");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar  = document.getElementById("appSidebar");
const appSidebarScrim = document.getElementById("appSidebarScrim");
const logoutBtn   = document.getElementById("logoutBtn");
const deleteRegModal = new bootstrap.Modal(document.getElementById("deleteRegModal"));

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    admin = getCurrentAdmin();
    if (!admin) { window.location.href = "/assets/pages/admin/admin-login.html"; return; }
    setupSidebar(); setupLogout();
    await loadData();
    buildSessionList();
    populateFacultySelects();
    pageState.classList.add("d-none");
    pageContent.classList.remove("d-none");
    bindTabs();
    bindCurrentTab();
    bindHistoryTab();
    /* Auto-load all students for current semester */
    renderCurrStudents();
  } catch (err) {
    console.error(err);
    pageState.innerHTML = `<div class="alert alert-danger mb-0">Failed to load registrations.</div>`;
  }
}

async function loadData() {
  [students, departments, faculties, courses, registrations, calendar] = await Promise.all([
    getStudents(), getDepartments(), getFaculties(), getCourses(),
    getRegistrations(), getAcademicCalendar(),
  ]);
}

function buildSessionList() {
  const set = new Set([...registrations.map(r => r.session), calendar.currentSession]);
  allSessions = Array.from(set).sort().reverse();
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
      document.getElementById("currentTab").classList.toggle("d-none", tab !== "current");
      document.getElementById("historyTab").classList.toggle("d-none", tab !== "history");
    });
  });
}

/* ── Faculty selects ────────────────────────────────────── */
function populateFacultySelects() {
  const opts    = faculties.map(f => `<option value="${f.name}">${f.name}</option>`).join("");
  const deptOpts = `<option value="">All Departments</option>` +
    departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  const sessOpts = allSessions.map(s => `<option value="${s}">${s}</option>`).join("");

  document.getElementById("rCurrFaculty").innerHTML = `<option value="">All Faculties</option>` + opts;
  document.getElementById("rCurrDept").innerHTML    = deptOpts;
  document.getElementById("rCurrSession").innerHTML = sessOpts;
  document.getElementById("rCurrSession").value     = calendar.currentSession;
  document.getElementById("rCurrSemester").value    = String(calendar.currentSemester);

  document.getElementById("rHistFaculty").innerHTML = `<option value="">All Faculties</option>` + opts;
  document.getElementById("rHistDept").innerHTML    = deptOpts;
  document.getElementById("rHistSession").innerHTML = `<option value="">All Sessions</option>` + sessOpts;

  document.getElementById("loadHistoryBtn").disabled = false;

  /* Render metrics for current semester */
  renderRegMetrics();
}

function renderRegMetrics() {
  const session  = calendar.currentSession;
  const semester = Number(calendar.currentSemester);
  const currRegs = registrations.filter(
    r => r.session === session && Number(r.semester) === semester
  );
  const regStudentIds  = new Set(currRegs.map(r => String(r.studentId)));
  const carryoverCount = currRegs.filter(r => r.type === "carry-over").length;
  const uniqueCourses  = new Set(currRegs.map(r => String(r.courseId))).size;

  const el = id => document.getElementById(id);
  if (el("regmTotal"))     el("regmTotal").textContent    = currRegs.length;
  if (el("regmStudents"))  el("regmStudents").textContent = regStudentIds.size;
  if (el("regmCarryover")) el("regmCarryover").textContent = carryoverCount;
  if (el("regmCourses"))   el("regmCourses").textContent  = uniqueCourses;
}

/* ════════════════════════════════════════════════════════
   CURRENT REGISTRATION TAB
   ════════════════════════════════════════════════════════ */
function bindCurrentTab() {
  document.getElementById("rCurrFaculty").addEventListener("change", onCurrFacultyChange);
  document.getElementById("rCurrDept").addEventListener("change", onCurrDeptChange);
  document.getElementById("rCurrLevel").addEventListener("change", renderCurrStudents);
  document.getElementById("rCurrSession").addEventListener("change", renderCurrStudents);
  document.getElementById("rCurrSemester").addEventListener("change", renderCurrStudents);
  document.getElementById("rCurrSearch").addEventListener("input", () => { currPage = 1; renderCurrStudents(); });
  document.getElementById("backToStudentsBtn").addEventListener("click", showStudentList);
  document.getElementById("addCourseToRegBtn").addEventListener("click", openAddCoursePicker);
  document.getElementById("cancelAddCourseBtn").addEventListener("click", closeAddCoursePicker);
  document.getElementById("confirmAddCourseBtn").addEventListener("click", handleAddCourse);
  document.getElementById("confirmDeleteRegBtn").addEventListener("click", handleDeleteRegConfirm);
}

function onCurrFacultyChange() {
  const faculty = document.getElementById("rCurrFaculty").value;
  const deptSel = document.getElementById("rCurrDept");
  deptSel.innerHTML = `<option value="">All Departments</option>` +
    departments.filter(d => !faculty || d.faculty === faculty)
      .map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  deptSel.disabled = false;
  renderCurrStudents();
}

function onCurrDeptChange() {
  renderCurrStudents();
}

function getCurrFilters() {
  return {
    deptId:   document.getElementById("rCurrDept").value,
    level:    document.getElementById("rCurrLevel").value,
    session:  document.getElementById("rCurrSession").value,
    semester: Number(document.getElementById("rCurrSemester").value),
  };
}

function renderCurrStudents() {
  const { deptId, level, session, semester } = getCurrFilters();

  document.getElementById("regManagePanel").classList.add("d-none");
  document.getElementById("currFilterPrompt").classList.add("d-none");
  document.getElementById("currStudentArea").classList.remove("d-none");

  let deptStudents = students.filter(s =>
    (!deptId || String(s.departmentId) === String(deptId)) &&
    (!level  || Number(s.level) === Number(level))
  );

  const q = document.getElementById("rCurrSearch").value.trim().toLowerCase();
  if (q) deptStudents = deptStudents.filter(s =>
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
    s.matricNumber.toLowerCase().includes(q)
  );

  document.getElementById("rCurrStudentCount").textContent =
    `${deptStudents.length} student${deptStudents.length === 1 ? "" : "s"}`;

  const totalPages = Math.max(1, Math.ceil(deptStudents.length / PAGE_SIZE));
  if (currPage > totalPages) currPage = totalPages;
  const start = (currPage - 1) * PAGE_SIZE;
  const paged = deptStudents.slice(start, start + PAGE_SIZE);

  document.getElementById("currPaginationInfo").textContent =
    deptStudents.length ? `Showing ${start+1}–${Math.min(start+PAGE_SIZE,deptStudents.length)} of ${deptStudents.length}` : "";

  const tbody = document.getElementById("currStudentsTbody");
  const empty = document.getElementById("currStudentsEmpty");

  if (paged.length === 0) { tbody.innerHTML = ""; empty.classList.remove("d-none"); renderCurrPagination(0); return; }
  empty.classList.add("d-none");

  tbody.innerHTML = paged.map(s => {
    const regCount = registrations.filter(r =>
      String(r.studentId) === String(s.id) &&
      r.session === session &&
      Number(r.semester) === semester
    ).length;
    return `<tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <span class="student-avatar-mini">${(s.firstName[0]+s.lastName[0]).toUpperCase()}</span>
          <div class="fw-semibold">${s.firstName} ${s.lastName}</div>
        </div>
      </td>
      <td class="text-muted-cell">${s.matricNumber}</td>
      <td>${regCount} course${regCount === 1 ? "" : "s"}</td>
      <td class="text-end">
        <button class="btn btn-brand btn-sm" data-action="manage" data-id="${s.id}">
          <i class="bi bi-pencil-square"></i> Manage
        </button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-action='manage']").forEach(btn =>
    btn.addEventListener("click", () => openRegManagePanel(btn.dataset.id)));

  renderCurrPagination(totalPages);
}

function renderCurrPagination(totalPages) {
  const list = document.getElementById("currPaginationList");
  if (totalPages <= 1) { list.innerHTML = ""; return; }
  let html = `<li class="page-item${currPage===1?" disabled":""}"><button class="page-link" data-page="${currPage-1}">&lsaquo;</button></li>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<li class="page-item${i===currPage?" active":""}"><button class="page-link" data-page="${i}">${i}</button></li>`;
  }
  html += `<li class="page-item${currPage===totalPages?" disabled":""}"><button class="page-link" data-page="${currPage+1}">&rsaquo;</button></li>`;
  list.innerHTML = html;
  list.querySelectorAll("[data-page]").forEach(btn =>
    btn.addEventListener("click", () => { currPage = Number(btn.dataset.page); renderCurrStudents(); }));
}

/* ── Registration manage panel ──────────────────────────── */
function openRegManagePanel(studentId) {
  const { session, semester, deptId } = getCurrFilters();
  const student = students.find(s => String(s.id) === String(studentId));
  if (!student) return;

  currSelectedStudentId = studentId;
  document.getElementById("currStudentArea").classList.add("d-none");
  document.getElementById("regManagePanel").classList.remove("d-none");
  document.getElementById("addCoursePicker").classList.add("d-none");
  document.getElementById("regStudentName").textContent = `${student.firstName} ${student.lastName}`;
  document.getElementById("regStudentMeta").textContent = `${student.matricNumber} · ${session} Semester ${semester}`;

  /* Load live regs for this student/session/semester */
  currStudentRegs = registrations.filter(r =>
    String(r.studentId) === String(studentId) &&
    r.session === session &&
    Number(r.semester) === semester
  );

  renderRegCourses();
}

function renderRegCourses() {
  const tbody = document.getElementById("regCoursesTbody");
  const empty = document.getElementById("regCoursesEmpty");

  if (currStudentRegs.length === 0) {
    tbody.innerHTML = ""; empty.classList.remove("d-none"); return;
  }
  empty.classList.add("d-none");

  tbody.innerHTML = currStudentRegs.map(reg => {
    const course = courses.find(c => String(c.id) === String(reg.courseId));
    const typeTag = reg.type === "carry-over"
      ? `<span class="carryover-tag">CARRY-OVER</span>`
      : `<span class="status-badge status-badge--completed">Regular</span>`;
    return `<tr>
      <td class="fw-semibold">${course?.courseCode ?? "—"}</td>
      <td>${course?.courseTitle ?? "Unknown"}</td>
      <td>${course?.creditUnit ?? "—"}</td>
      <td>${typeTag}</td>
      <td class="text-end">
        <button class="btn btn-danger-soft btn-sm" data-action="remove" data-reg-id="${reg.id}" title="Remove">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-action='remove']").forEach(btn =>
    btn.addEventListener("click", () => confirmRemoveCourse(btn.dataset.regId)));
}

function showStudentList() {
  document.getElementById("regManagePanel").classList.add("d-none");
  document.getElementById("currStudentArea").classList.remove("d-none");
  currSelectedStudentId = null;
}

/* ── Add course to registration ─────────────────────────── */
function openAddCoursePicker() {
  const { deptId, level, semester } = getCurrFilters();
  const student = students.find(s => String(s.id) === String(currSelectedStudentId));

  /* Available courses: same dept, same level (student's level), same semester, not already registered */
  const studentLevel = student?.level;
  const availableCourses = courses.filter(c => {
    const inDept    = String(c.departmentId) === String(deptId);
    const inLevel   = Number(c.level) === Number(studentLevel);
    const inSem     = Number(c.semester) === Number(semester);
    const notReg    = !currStudentRegs.some(r => String(r.courseId) === String(c.id));
    const active    = (c.status || "active") === "active";
    return inDept && inLevel && inSem && notReg && active;
  });

  const sel = document.getElementById("addCourseSelect");
  sel.innerHTML = `<option value="">Select course to add…</option>` +
    availableCourses.map(c => `<option value="${c.id}">${c.courseCode} — ${c.courseTitle} (${c.creditUnit} cr)</option>`).join("");

  hideAlert("addCourseAlert");
  document.getElementById("addCoursePicker").classList.remove("d-none");
}

function closeAddCoursePicker() {
  document.getElementById("addCoursePicker").classList.add("d-none");
}

async function handleAddCourse() {
  hideAlert("addCourseAlert");
  const courseId = document.getElementById("addCourseSelect").value;
  const type     = document.getElementById("addCourseType").value;
  const { session, semester } = getCurrFilters();

  if (!courseId) { showAlert("addCourseAlert", "Please select a course."); return; }

  /* Prevent duplicate */
  const dup = registrations.find(r =>
    String(r.studentId) === String(currSelectedStudentId) &&
    String(r.courseId)  === String(courseId) &&
    r.session === session &&
    Number(r.semester) === semester
  );
  if (dup) { showAlert("addCourseAlert", "This course is already registered for this student."); return; }

  try {
    const created = await createRegistration({
      studentId: currSelectedStudentId,
      courseId,
      session,
      semester,
      type,
    });
    registrations.push(created);
    currStudentRegs.push(created);
    closeAddCoursePicker();
    renderRegCourses();
    renderCurrStudents();   // refresh count in student list
  } catch (err) {
    console.error(err);
    showAlert("addCourseAlert", "Failed to add course. Please try again.");
  }
}

/* ── Remove course from registration ────────────────────── */
function confirmRemoveCourse(regId) {
  const reg    = registrations.find(r => String(r.id) === String(regId));
  const course = reg ? courses.find(c => String(c.id) === String(reg.courseId)) : null;
  pendingDeleteRegId = regId;
  document.getElementById("deleteRegBody").textContent =
    `This will remove "${course?.courseCode ?? "this course"}" from the student's registration. This cannot be undone.`;
  deleteRegModal.show();
}

async function handleDeleteRegConfirm() {
  try {
    await deleteRegistration(pendingDeleteRegId);
    registrations = registrations.filter(r => String(r.id) !== String(pendingDeleteRegId));
    currStudentRegs = currStudentRegs.filter(r => String(r.id) !== String(pendingDeleteRegId));
    deleteRegModal.hide();
    renderRegCourses();
    renderCurrStudents();
  } catch (err) {
    console.error(err);
    alert("Failed to remove registration. Please try again.");
  }
}

/* ════════════════════════════════════════════════════════
   REGISTRATION HISTORY TAB
   ════════════════════════════════════════════════════════ */
function bindHistoryTab() {
  document.getElementById("rHistFaculty").addEventListener("change", onHistFacultyChange);
  document.getElementById("rHistDept").addEventListener("change", onHistDeptChange);
  document.getElementById("loadHistoryBtn").addEventListener("click", loadHistory);
  document.getElementById("rHistSearch").addEventListener("input", () => { histPage = 1; renderHistTable(); });
}

function onHistFacultyChange() {
  const faculty = document.getElementById("rHistFaculty").value;
  const deptSel = document.getElementById("rHistDept");
  deptSel.innerHTML = `<option value="">All Departments</option>` +
    departments.filter(d => !faculty || d.faculty === faculty)
      .map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  deptSel.disabled = false;
}

function onHistDeptChange() {
  document.getElementById("loadHistoryBtn").disabled = false;
}

function loadHistory() {
  document.getElementById("histFilterPrompt").classList.add("d-none");
  document.getElementById("histResultsArea").classList.remove("d-none");
  histPage = 1;
  buildHistData();
  renderHistTable();
}

function buildHistData() {
  const deptId   = document.getElementById("rHistDept").value;
  const level    = document.getElementById("rHistLevel").value;
  const session  = document.getElementById("rHistSession").value;
  const semester = document.getElementById("rHistSemester").value;

  const deptStudentIds = new Set(
    students
      .filter(s => String(s.departmentId) === String(deptId) && (!level || Number(s.level) === Number(level)))
      .map(s => String(s.id))
  );

  histData = registrations
    .filter(r => {
      const inDept  = deptStudentIds.has(String(r.studentId));
      const sessMatch = !session  || r.session === session;
      const semMatch  = !semester || Number(r.semester) === Number(semester);
      return inDept && sessMatch && semMatch;
    })
    .map(r => ({
      ...r,
      student: students.find(s => String(s.id) === String(r.studentId)),
      course:  courses.find(c  => String(c.id) === String(r.courseId)),
    }));
}

function renderHistTable() {
  const q = document.getElementById("rHistSearch").value.trim().toLowerCase();
  const filtered = q
    ? histData.filter(r =>
        (r.student && `${r.student.firstName} ${r.student.lastName}`.toLowerCase().includes(q)) ||
        (r.student && r.student.matricNumber.toLowerCase().includes(q)) ||
        (r.course  && r.course.courseCode.toLowerCase().includes(q)))
    : histData;

  document.getElementById("rHistCount").textContent = `${filtered.length} registration${filtered.length === 1 ? "" : "s"}`;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (histPage > totalPages) histPage = totalPages;
  const start = (histPage - 1) * PAGE_SIZE;
  const paged = filtered.slice(start, start + PAGE_SIZE);

  document.getElementById("histPaginationInfo").textContent =
    filtered.length ? `Showing ${start+1}–${Math.min(start+PAGE_SIZE,filtered.length)} of ${filtered.length}` : "";

  const tbody = document.getElementById("histRegsTbody");
  const empty = document.getElementById("histRegsEmpty");

  if (paged.length === 0) { tbody.innerHTML = ""; empty.classList.remove("d-none"); renderHistPagination(0); return; }
  empty.classList.add("d-none");

  tbody.innerHTML = paged.map(r => {
    const typeTag = r.type === "carry-over"
      ? `<span class="carryover-tag">CARRY-OVER</span>`
      : `<span class="status-badge status-badge--completed">Regular</span>`;
    return `<tr>
      <td class="fw-semibold">${r.student ? `${r.student.firstName} ${r.student.lastName}` : "Unknown"}</td>
      <td class="text-muted-cell">${r.student?.matricNumber ?? "—"}</td>
      <td class="text-muted-cell">${r.course ? `${r.course.courseCode} — ${r.course.courseTitle}` : "Unknown"}</td>
      <td>${r.session}</td>
      <td>Sem ${r.semester}</td>
      <td>${typeTag}</td>
    </tr>`;
  }).join("");

  renderHistPagination(totalPages);
}

function renderHistPagination(totalPages) {
  const list = document.getElementById("histPaginationList");
  if (totalPages <= 1) { list.innerHTML = ""; return; }
  let html = `<li class="page-item${histPage===1?" disabled":""}"><button class="page-link" data-page="${histPage-1}">&lsaquo;</button></li>`;
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && Math.abs(i - histPage) > 2 && i !== 1 && i !== totalPages) {
      if (i === 2 || i === totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      continue;
    }
    html += `<li class="page-item${i===histPage?" active":""}"><button class="page-link" data-page="${i}">${i}</button></li>`;
  }
  html += `<li class="page-item${histPage===totalPages?" disabled":""}"><button class="page-link" data-page="${histPage+1}">&rsaquo;</button></li>`;
  list.innerHTML = html;
  list.querySelectorAll("[data-page]").forEach(btn =>
    btn.addEventListener("click", () => { histPage = Number(btn.dataset.page); renderHistTable(); }));
}

/* ── Helpers ────────────────────────────────────────────── */
function showAlert(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.remove("d-none"); }
function hideAlert(id)      { const el = document.getElementById(id); el.textContent = "";  el.classList.add("d-none"); }
