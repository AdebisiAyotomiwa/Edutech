import { requireLecturerAuth, getCurrentLecturer, lecturerLogout } from "../lecturerAuth.js";
import {
  getCourseAssignments, getCourses, getAcademicCalendar,
  getRegistrations, getStudents,
  getResultSubmissions, createResultSubmission, updateResultSubmission,
  getResults, createResult, updateResult,
} from "../api.js";
import { scoreToGrade } from "../utils.js";
import { initMobileSidebar } from "../sidebar.js";

requireLecturerAuth();

/* ── State ──────────────────────────────────────────────── */
let lecturer      = null;
let calendar      = null;
let assignments   = [];
let courses       = [];
let students      = [];
let registrations = [];
let submissions   = [];
let results       = [];

let selectedCourseId   = null;
let selectedCourse     = null;
let existingSubmission = null;

/*
 * DUPLICATE-SUBMISSION GUARD — two problems could previously let a
 * lecturer create two "pending" resultSubmissions for the same
 * course/session/semester:
 *   1. A user could double-click "Yes, Submit" (or the confirm modal
 *      could be re-triggered) before the in-flight request finished,
 *      firing handleSubmit() twice concurrently.
 *   2. existingSubmission was only ever checked against the
 *      *in-memory* submissions array, which can be stale if the page
 *      was reloaded/re-entered before an earlier submit's refetch
 *      had a chance to settle elsewhere (e.g. two tabs, or a fast
 *      back/forward navigation).
 * isSubmitting fixes (1). The live re-check inside handleSubmit()
 * fixes (2) by asking the server directly, right before writing,
 * whether a submission already exists for this exact course/term.
 */
let isSubmitting = false;

/* ── Bootstrap modals ───────────────────────────────────── */
let submitConfirmModal;

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
    submitConfirmModal = new bootstrap.Modal(document.getElementById("submitConfirmModal"));

    await loadData();
    populateCourseSelect();

    const params         = new URLSearchParams(window.location.search);
    const preselectedId  = params.get("courseId");
    /*
     * BUG 8 FIX — read the ?resubmit=1 flag that lecturer-history.html
     * and lecturer-courses.html append to the "Resubmit" link.
     * Previously the param was ignored, so the upload page opened in
     * first-time mode even for a rejected batch: the rejected notice
     * was hidden, the submit button label said "Submit for Approval"
     * with no context, and the user had no visual confirmation they
     * were fixing a rejected submission.
     *
     * The fix: after loadCourse() resolves, if ?resubmit=1 is set we
     * scroll the rejected notice into view and show a highlighted
     * status message so the intent is unmistakable.
     */
    const isResubmitEntry = params.get("resubmit") === "1";

    if (preselectedId) {
      document.getElementById("courseSelect").value = preselectedId;
      /* Sync the custom dropdown display to match the pre-selected value */
      syncCustomSelectDisplay(preselectedId);
    }

    document.getElementById("pageLoading").classList.add("d-none");
    document.getElementById("pageContent").classList.remove("d-none");

    if (preselectedId) {
      await loadCourse();   // must await so DOM is ready before we scroll

      if (isResubmitEntry) {
        // Confirm the submission is actually rejected before announcing it.
        // loadCourse() sets existingSubmission; check its status here.
        const st = (existingSubmission?.status || "").toLowerCase().trim();
        if (st === "rejected") {
          // Scroll the rejection notice into view
          const notice = document.getElementById("rejectedNotice");
          notice?.scrollIntoView({ behavior: "smooth", block: "center" });
          // Show a clear call-to-action in the status bar
          showSubmitStatus(
            "⚠ This batch was rejected. Correct the scores below and click Submit for Approval.",
            "warning"
          );
        } else if (st === "pending" || st === "approved") {
          // Edge case: admin approved/re-opened between the click and page load
          showSubmitStatus(
            `This batch is currently "${existingSubmission.status}" and cannot be resubmitted.`,
            "info"
          );
        }
        // If st is empty (no submission found) — nothing to announce; normal first-upload flow.
      }
    }

    document.getElementById("loadCourseBtn").addEventListener("click", () => loadCourse());
    document.getElementById("submitBtn").addEventListener("click", openSubmitConfirm);
    document.getElementById("confirmSubmitBtn").addEventListener("click", handleSubmit);
  } catch (err) {
    console.error(err);
    document.getElementById("pageLoading").innerHTML =
      `<div class="alert alert-danger mb-0">Failed to load page. Please refresh.</div>`;
  }
}

/* ── Data ───────────────────────────────────────────────── */
async function loadData() {
  [assignments, courses, calendar, students, registrations, submissions, results] = await Promise.all([
    getCourseAssignments({ lecturerId: Number(lecturer.id) }),
    getCourses(),
    getAcademicCalendar(),
    getStudents(),
    getRegistrations(),
    getResultSubmissions({ lecturerId: Number(lecturer.id) }),
    getResults(),
  ]);
}

/* ── Course select dropdown ─────────────────────────────── */

/* ── Custom combobox state ──────────────────────────────── */
let customSelectOpen = false;

function populateCourseSelect() {
  const currAssignments = assignments.filter(
    a => a.session === calendar.currentSession &&
         Number(a.semester) === Number(calendar.currentSemester)
  );

  /* Always keep the hidden native select in sync for JS readers */
  const nativeSel = document.getElementById("courseSelect");
  const list      = document.getElementById("courseSelectList");
  const btn       = document.getElementById("courseSelectBtn");
  const valueEl   = document.getElementById("courseSelectValue");

  if (currAssignments.length === 0) {
    nativeSel.innerHTML = `<option value="">No courses assigned for this semester</option>`;
    list.innerHTML = `<li class="course-select-option is-placeholder is-disabled" role="option" aria-selected="false">
      No courses assigned for this semester
    </li>`;
    valueEl.textContent = "No courses assigned for this semester";
    valueEl.classList.add("is-placeholder");
    document.getElementById("loadCourseBtn").disabled = true;
    return;
  }

  /* Build option data */
  const options = currAssignments
    .map(a => {
      const c = courses.find(co => String(co.id) === String(a.courseId));
      return c ? { value: String(c.id), label: `${c.courseCode} — ${c.courseTitle}` } : null;
    })
    .filter(Boolean);

  /* Populate hidden native select (JS reads .value from this) */
  nativeSel.innerHTML =
    `<option value="">— Choose a course —</option>` +
    options.map(o => `<option value="${o.value}">${o.label}</option>`).join("");

  /* Populate custom list */
  list.innerHTML =
    `<li class="course-select-option is-placeholder"
         role="option"
         data-value=""
         aria-selected="true"
         tabindex="-1">— Choose a course —</li>` +
    options.map(o =>
      `<li class="course-select-option"
           role="option"
           data-value="${o.value}"
           aria-selected="false"
           tabindex="-1">${o.label}</li>`
    ).join("");

  /* Reset display to placeholder */
  valueEl.textContent = "— Choose a course —";
  valueEl.classList.add("is-placeholder");

  /* Wire click on each option */
  list.querySelectorAll(".course-select-option").forEach(item => {
    item.addEventListener("click", () => {
      selectCourseOption(item.dataset.value, item.textContent.trim(), item);
    });
    /* Keyboard: Enter / Space selects */
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectCourseOption(item.dataset.value, item.textContent.trim(), item);
      }
      /* Arrow navigation within list */
      if (e.key === "ArrowDown") { e.preventDefault(); focusNextOption(item, 1); }
      if (e.key === "ArrowUp")   { e.preventDefault(); focusNextOption(item, -1); }
      if (e.key === "Escape")    { closeCustomSelect(); btn.focus(); }
    });
  });

  /* Wire trigger button */
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    customSelectOpen ? closeCustomSelect() : openCustomSelect();
  });

  /* Keyboard on trigger */
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openCustomSelect();
      list.querySelector("[role='option']")?.focus();
    }
    if (e.key === "Escape") closeCustomSelect();
  });
}

function selectCourseOption(value, label, itemEl) {
  const nativeSel = document.getElementById("courseSelect");
  const valueEl   = document.getElementById("courseSelectValue");
  const list      = document.getElementById("courseSelectList");
  const btn       = document.getElementById("courseSelectBtn");

  /* Update native select (JS reads this for loadCourse()) */
  nativeSel.value = value;

  /* Update display */
  valueEl.textContent = label;
  valueEl.classList.toggle("is-placeholder", value === "");

  /* Update aria-selected on all items */
  list.querySelectorAll(".course-select-option").forEach(i =>
    i.setAttribute("aria-selected", i === itemEl ? "true" : "false")
  );

  closeCustomSelect();
  btn.focus();
}

function openCustomSelect() {
  const list = document.getElementById("courseSelectList");
  const btn  = document.getElementById("courseSelectBtn");
  const wrap = document.getElementById("courseSelectWrap");

  list.classList.add("is-open");
  btn.setAttribute("aria-expanded", "true");
  customSelectOpen = true;

  /* Flip above if not enough space below */
  const rect = wrap.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  list.classList.toggle("opens-above", spaceBelow < 240);

  /* Focus the currently selected item or the first */
  const selected = list.querySelector("[aria-selected='true']") || list.querySelector("[role='option']");
  selected?.focus();
}

function closeCustomSelect() {
  const list = document.getElementById("courseSelectList");
  const btn  = document.getElementById("courseSelectBtn");
  if (!list) return;
  list.classList.remove("is-open");
  btn.setAttribute("aria-expanded", "false");
  customSelectOpen = false;
}

function focusNextOption(current, direction) {
  const list    = document.getElementById("courseSelectList");
  const items   = Array.from(list.querySelectorAll("[role='option']:not(.is-disabled)"));
  const idx     = items.indexOf(current);
  const next    = items[idx + direction];
  if (next) next.focus();
}

/* Close dropdown when clicking anywhere outside */
document.addEventListener("click", (e) => {
  if (customSelectOpen && !document.getElementById("courseSelectWrap")?.contains(e.target)) {
    closeCustomSelect();
  }
});

/* Sync the custom dropdown's displayed text to match a given value.
   Called after pre-selection via URL params. */
function syncCustomSelectDisplay(value) {
  const list    = document.getElementById("courseSelectList");
  const valueEl = document.getElementById("courseSelectValue");
  if (!list || !valueEl) return;
  const item = list.querySelector(`[data-value="${CSS.escape(value)}"]`);
  if (item) {
    valueEl.textContent = item.textContent.trim();
    valueEl.classList.remove("is-placeholder");
    list.querySelectorAll(".course-select-option").forEach(i =>
      i.setAttribute("aria-selected", i === item ? "true" : "false")
    );
  }
}

/* ── Load course & students ─────────────────────────────── */
async function loadCourse() {
  const courseId = document.getElementById("courseSelect").value;
  if (!courseId) {
    showSubmitStatus("Please select a course first.", "warning");
    return;
  }

  selectedCourseId = courseId;
  selectedCourse   = courses.find(c => String(c.id) === String(courseId));

  /*
   * BUG 1 FIX — always re-read existingSubmission from the latest
   * submissions array so loadCourse() never works from stale data.
   * Previously the variable was only set once on first load, so
   * after a submit the course still appeared editable.
   */
  existingSubmission = submissions.find(
    s => String(s.courseId) === String(courseId) &&
         s.session           === calendar.currentSession &&
         Number(s.semester)  === Number(calendar.currentSemester)
  );

  try {
    const courseRegsFromAPI = await getRegistrations({
      courseId: Number(courseId),
      session:  calendar.currentSession,
      semester: Number(calendar.currentSemester),
    });
    registrations = [
      ...registrations.filter(r =>
        !(String(r.courseId) === String(courseId) &&
          r.session === calendar.currentSession &&
          Number(r.semester) === Number(calendar.currentSemester))
      ),
      ...courseRegsFromAPI,
    ];
  } catch { /* fall back to full registrations array already in memory */ }

  renderCourseInfoBanner();
  renderStatusNotices();
  renderStudentTable();

  document.getElementById("scoreEntrySection").classList.remove("d-none");
}

/* ── Course info banner ─────────────────────────────────── */
function renderCourseInfoBanner() {
  document.getElementById("courseInfoBanner").innerHTML = `
    <div class="d-flex align-items-center gap-3 flex-wrap">
      <div class="lecturer-course-icon" style="flex-shrink:0;"><i class="bi bi-journal-text"></i></div>
      <div>
        <div class="fw-bold" style="font-family:var(--font-display);">${selectedCourse.courseCode} — ${selectedCourse.courseTitle}</div>
        <div class="text-muted small">${calendar.currentSession} · Semester ${calendar.currentSemester} · ${selectedCourse.level} Level · ${selectedCourse.creditUnit} credit units</div>
      </div>
    </div>`;
}

/* ── Status notices ──────────────────────────────────────────
   BUG 3 FIX — renderStatusNotices() now reads directly from
   existingSubmission each time it is called.  The caller
   (handleSubmit) must update existingSubmission BEFORE calling
   this function, which we now guarantee.
   ─────────────────────────────────────────────────────────── */
function renderStatusNotices() {
  ["pendingNotice", "approvedNotice", "rejectedNotice"].forEach(id =>
    document.getElementById(id).classList.add("d-none")
  );
  const submitBtn = document.getElementById("submitBtn");
  const actionBar = document.getElementById("actionBar");

  if (!existingSubmission) {
    submitBtn.disabled = false;
    actionBar.classList.remove("d-none");
    return;
  }

  const st = (existingSubmission.status || "").toLowerCase().trim();

  if (st === "pending") {
    document.getElementById("pendingNotice").classList.remove("d-none");
    submitBtn.disabled = true;
    actionBar.classList.remove("d-none");
  } else if (st === "approved") {
    document.getElementById("approvedNotice").classList.remove("d-none");
    submitBtn.disabled = true;
    actionBar.classList.add("d-none");
  } else if (st === "rejected") {
    document.getElementById("rejectedNotice").classList.remove("d-none");
    document.getElementById("rejectionReasonText").textContent =
      existingSubmission.rejectionReason || "—";
    submitBtn.disabled  = false;
    actionBar.classList.remove("d-none");
  }
}

/* ── Student table ──────────────────────────────────────── */
function renderStudentTable() {
  const courseRegs = registrations.filter(r =>
    String(r.courseId) === String(selectedCourseId) &&
    r.session           === calendar.currentSession &&
    Number(r.semester)  === Number(calendar.currentSemester)
  );

  const scoreTableWrap  = document.getElementById("scoreTableWrap");
  const noStudentsEmpty = document.getElementById("noStudentsEmpty");

  document.getElementById("scoreTableCount").textContent =
    `${courseRegs.length} student${courseRegs.length === 1 ? "" : "s"}`;

  if (courseRegs.length === 0) {
    scoreTableWrap.classList.add("d-none");
    noStudentsEmpty.classList.remove("d-none");
    document.getElementById("actionBar").classList.add("d-none");
    return;
  }

  scoreTableWrap.classList.remove("d-none");
  noStudentsEmpty.classList.add("d-none");

  const isLocked = existingSubmission &&
    (existingSubmission.status === "pending" || existingSubmission.status === "approved");

  const tbody = document.getElementById("scoreTbody");
  tbody.innerHTML = courseRegs.map((reg, idx) => {
    const student = students.find(s => String(s.id) === String(reg.studentId));
    if (!student) return "";

    const existingResult = results.find(r =>
      String(r.studentId) === String(student.id) &&
      String(r.courseId)  === String(selectedCourseId) &&
      r.session            === calendar.currentSession &&
      Number(r.semester)   === Number(calendar.currentSemester) &&
      (existingSubmission
        ? String(r.submissionId) === String(existingSubmission.id)
        : true)
    );

    const score = existingResult ? existingResult.score : "";

    /*
     * BUG 2 FIX — grade is always computed fresh here from the
     * current score value.  Previously the grade preview cell was
     * only updated by the input event listener, so after a page
     * re-render triggered by handleSubmit() the grade column showed
     * stale "—" values even though scores were already saved.
     */
    const gradeHtml = score !== ""
      ? (() => {
          const { grade } = scoreToGrade(Number(score));
          return `<span class="badge-grade badge-grade--${grade.toLowerCase()}">${grade}</span>`;
        })()
      : "—";

    const inputHtml = isLocked
      ? `<input type="number" class="form-control score-input" value="${score}" disabled style="width:90px;">`
      : `<input type="number" class="form-control score-input"
             data-student-id="${student.id}"
             data-result-id="${existingResult ? existingResult.id : ""}"
             min="0" max="100" value="${score}" placeholder="0–100"
             style="width:90px;" />`;

    return `<tr data-student-id="${student.id}" data-course-id="${selectedCourseId}">
      <td class="text-muted-cell">${idx + 1}</td>
      <td>
        <div class="d-flex align-items-center gap-2">
          <span class="student-avatar-mini">${(student.firstName[0] + student.lastName[0]).toUpperCase()}</span>
          <span class="fw-semibold">${student.firstName} ${student.lastName}</span>
        </div>
      </td>
      <td class="text-muted-cell">${student.matricNumber}</td>
      <td>${inputHtml}</td>
      <td class="grade-preview fw-semibold">${gradeHtml}</td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll(".score-input:not([disabled])").forEach(input => {
    input.addEventListener("input", () => {
      const row       = input.closest("tr");
      const val       = input.value.trim();
      const gradeCell = row.querySelector(".grade-preview");
      if (val === "" || isNaN(Number(val))) {
        gradeCell.innerHTML = "—";
      } else {
        const { grade } = scoreToGrade(Number(val));
        gradeCell.innerHTML = `<span class="badge-grade badge-grade--${grade.toLowerCase()}">${grade}</span>`;
      }
      updateValidationSummary();
    });
  });

  updateValidationSummary();
}

/* ── Validation summary ─────────────────────────────────── */
function updateValidationSummary() {
  const inputs  = Array.from(document.querySelectorAll("#scoreTbody .score-input:not([disabled])"));
  const filled  = inputs.filter(i => i.value.trim() !== "").length;
  const invalid = inputs.filter(i => {
    const v = Number(i.value.trim());
    return i.value.trim() !== "" && (isNaN(v) || v < 0 || v > 100);
  }).length;

  const summary = document.getElementById("validationSummary");
  if (invalid > 0) {
    summary.innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i>${invalid} invalid score${invalid > 1 ? "s" : ""} — must be 0–100</span>`;
  } else {
    summary.innerHTML = `${filled} / ${inputs.length} scores entered`;
  }
}

/* ── Submit confirm modal ───────────────────────────────── */
function openSubmitConfirm() {
  const inputs   = Array.from(document.querySelectorAll("#scoreTbody .score-input:not([disabled])"));
  const filled   = inputs.filter(i => i.value.trim() !== "").length;
  const invalid  = inputs.filter(i => {
    const v = Number(i.value.trim());
    return i.value.trim() !== "" && (isNaN(v) || v < 0 || v > 100);
  }).length;

  if (filled === 0) {
    showSubmitStatus("Enter at least one score before submitting.", "warning");
    return;
  }
  if (invalid > 0) {
    showSubmitStatus(`Fix ${invalid} invalid score${invalid > 1 ? "s" : ""} before submitting.`, "danger");
    return;
  }

  const missingCount = inputs.length - filled;
  let bodyText = `${filled} score${filled === 1 ? "" : "s"} for ${selectedCourse.courseCode}.`;
  if (missingCount > 0) {
    bodyText += ` Note: ${missingCount} student${missingCount === 1 ? "" : "s"} will have no score recorded.`;
  }
  document.getElementById("submitConfirmBody").textContent = bodyText;
  submitConfirmModal.show();
}

/* ── Handle actual submit ───────────────────────────────────
   BUG 1 + 3 FIX — existingSubmission is updated in-place
   BEFORE renderStatusNotices() and renderStudentTable() are
   called, so those functions always see the correct post-
   submit state (locked / pending).

   BUG 4 FIX — confirmBtn spinner + disabled state is reset
   inside a `finally` block that always runs, even when an
   error is thrown part-way through the API calls.
   ─────────────────────────────────────────────────────────── */
async function handleSubmit() {
  /* DUPLICATE-SUBMISSION GUARD (1/2) — reject re-entrant calls.
     Without this, a double-click on "Yes, Submit" (or any other
     path that could fire the handler twice before the first
     request round-trips) could create two resultSubmissions rows
     for the same course/session/semester. */
  if (isSubmitting) return;
  isSubmitting = true;

  const confirmBtn = document.getElementById("confirmSubmitBtn");
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Submitting…`;

  try {
    const inputs = Array.from(document.querySelectorAll("#scoreTbody .score-input:not([disabled])"));
    const scoreRows = inputs
      .filter(i => i.value.trim() !== "")
      .map(i => ({
        studentId: i.dataset.studentId,
        resultId:  i.dataset.resultId,
        score:     Number(i.value.trim()),
      }))
      .filter(r => !isNaN(r.score) && r.score >= 0 && r.score <= 100);

    if (scoreRows.length === 0) {
      showSubmitStatus("No valid scores to submit.", "warning");
      return;  // finally still runs — spinner resets
    }

    /* DUPLICATE-SUBMISSION GUARD (2/2) — re-check the server directly
       right before writing, instead of trusting only the in-memory
       `existingSubmission` (which may be stale after a fast reload,
       a second tab, or a race with another action). If the server
       already has a submission for this exact course/session/semester
       that we don't know about locally, adopt it and bail out of the
       "first-time submission" branch instead of creating a duplicate. */
    const liveMatches = await getResultSubmissions({
      lecturerId: Number(lecturer.id),
      courseId:   Number(selectedCourseId),
      session:    calendar.currentSession,
      semester:   Number(calendar.currentSemester),
    });
    if (liveMatches.length > 0 && !existingSubmission) {
      existingSubmission = liveMatches[0];
      showSubmitStatus(
        "A submission for this course already exists — refreshing instead of creating a duplicate.",
        "info"
      );
      renderStatusNotices();
      renderStudentTable();
      return; // finally still runs — spinner resets
    }

    const isResubmit = existingSubmission && existingSubmission.status === "rejected";
    const newVersion = isResubmit ? (existingSubmission.version + 1) : 1;

    if (!existingSubmission) {
      /* ── First-time submission ────────────────────────── */
      const sub = await createResultSubmission({
        /*
         * TYPE-CONSISTENCY FIX — every read path (dashboard, courses,
         * history) filters resultSubmissions with
         * getResultSubmissions({ lecturerId: Number(lecturer.id), ... })
         * and json-server's query filter is type-strict: a numeric
         * `1` does NOT match a string `"1"`. Every other record in
         * this DB stores lecturerId/courseId as numbers, so writing
         * them here as raw strings (lecturer.id from auth state,
         * selectedCourseId from a <select> element's .value — both
         * always strings) silently created submissions that were
         * invisible to every lecturer-side query forever, even after
         * being approved/rejected by an admin. Coerce to Number so
         * newly created rows match the convention used everywhere else.
         */
        lecturerId:      Number(lecturer.id),
        courseId:        Number(selectedCourseId),
        session:         calendar.currentSession,
        semester:        Number(calendar.currentSemester),
        level:           selectedCourse.level,
        status:          "pending",
        submittedAt:     new Date().toISOString(),
        reviewedBy:      null,
        reviewedAt:      null,
        rejectionReason: null,
        version:         1,
      });

      /*
       * BUG 1 + 3 FIX — update existingSubmission immediately
       * so that renderStatusNotices() at the bottom reads the
       * correct new "pending" state, not null.
       */
      existingSubmission = sub;

      await Promise.all(scoreRows.map(row =>
        createResult({
          studentId:    Number(row.studentId),
          courseId:     Number(selectedCourseId),
          session:      calendar.currentSession,
          semester:     Number(calendar.currentSemester),
          level:        Number(selectedCourse.level),
          score:        row.score,
          published:    false,
          submissionId: sub.id,
          uploadedBy:   lecturer.id,
        })
      ));
    } else {
      /* ── Resubmit (rejected batch) ────────────────────── */
      const submissionId = existingSubmission.id;

      await Promise.all(scoreRows.map(row => {
        if (row.resultId) {
          return updateResult(row.resultId, { score: row.score, published: false });
        } else {
          return createResult({
            studentId:    Number(row.studentId),
            courseId:     Number(selectedCourseId),
            session:      calendar.currentSession,
            semester:     Number(calendar.currentSemester),
            level:        Number(selectedCourse.level),
            score:        row.score,
            published:    false,
            submissionId: submissionId,
            uploadedBy:   lecturer.id,
          });
        }
      }));

      const updated = await updateResultSubmission(submissionId, {
        status:          "pending",
        submittedAt:     new Date().toISOString(),
        reviewedBy:      null,
        reviewedAt:      null,
        rejectionReason: null,
        version:         newVersion,
      }, {
        actorId:   lecturer.id,
        actorRole: "lecturer",
        note:      `Resubmitted batch after rejection (v${newVersion}).`,
      });

      /*
       * BUG 1 + 3 FIX — overwrite existingSubmission with the
       * freshly-updated record returned by the API so
       * renderStatusNotices() sees status="pending" and locks
       * the form correctly.
       */
      existingSubmission = updated;
    }

    submitConfirmModal.hide();
    showSubmitStatus(
      "✓ Submitted for admin approval! This batch is now locked until reviewed.",
      "success"
    );

    /*
     * Refresh in-memory arrays so subsequent loadCourse() calls
     * and re-renders work with current data.
     */
    [submissions, results] = await Promise.all([
      getResultSubmissions({ lecturerId: Number(lecturer.id) }),
      getResults(),
    ]);

    /*
     * BUG 1 + 3 FIX — always re-sync existingSubmission from the
     * freshly-fetched submissions array to pick up any server-side
     * normalisation (e.g. timestamps, version increments).
     */
    existingSubmission = submissions.find(
      s => String(s.courseId) === String(selectedCourseId) &&
           s.session           === calendar.currentSession &&
           Number(s.semester)  === Number(calendar.currentSemester)
    );

    /*
     * BUG 2 FIX — renderStudentTable() is called AFTER results
     * are re-fetched, so every grade cell is recomputed from the
     * latest saved score values rather than from stale DOM state.
     */
    renderStatusNotices();
    renderStudentTable();
  } catch (err) {
    console.error(err);
    showSubmitStatus("Something went wrong. Please try again.", "danger");
  } finally {
    /*
     * BUG 4 FIX — spinner and button state are always reset here,
     * even if an error is thrown anywhere above.  Previously the
     * reset only ran in the happy path, leaving the button stuck
     * in a disabled/spinning state after any failure.
     */
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = `<i class="bi bi-send-fill"></i> Yes, Submit`;
    isSubmitting = false;
  }
}

/* ── Sidebar ────────────────────────────────────────────── */
function setupSidebar() {
  const initials = (lecturer.name || "L").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("sidebarAvatarInitials").textContent = initials;
  document.getElementById("sidebarUserName").textContent       = lecturer.name || "Lecturer";
  document.getElementById("sidebarUserMeta").textContent       = lecturer.email;
  initMobileSidebar();
}

function setupLogout() {
  const modal = new bootstrap.Modal(document.getElementById("logoutConfirmModal"));
  document.getElementById("logoutBtn").addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
    lecturerLogout();
    window.location.href = "/assets/pages/lecturer/lecturer-login.html";
  });
}

/* ── Helpers ────────────────────────────────────────────── */
function showSubmitStatus(msg, type = "info") {
  const el = document.getElementById("submitStatusMsg");
  const colorMap = {
    success: "var(--success)",
    warning: "var(--warn)",
    danger:  "var(--danger)",
    info:    "var(--ink-400)",
  };
  el.style.color = colorMap[type] || "var(--ink-400)";
  el.textContent = msg;
}
