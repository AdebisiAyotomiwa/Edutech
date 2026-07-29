import {
  getCourses, getStudents, getRegistrations, getResults,
  getUnitLoadPolicy, createRegistration, createAuditLogEntry,
} from "./api.js";

/* =========================================================
   registrationEngine.js
   ---------------------------------------------------------
   Purpose:
   Business logic for the hybrid registration model.

   Responsibilities:
   ✓ Determine which students are eligible for a level/department/session/semester
   ✓ Determine which core courses to auto-register
   ✓ Detect same-semester carry-overs (a course failed in Semester N can
     only ever be carried over into a future Semester N — never Semester
     N+1 of the same session)
   ✓ Write the resulting registrations + a single collapsed audit log entry
   ✓ Compute unit totals against unitLoadPolicy

   Not responsible for:
   ✗ HTTP requests directly (delegates to api.js)
   ✗ DOM rendering
   ========================================================= */

/**
 * Finds courses a student has failed at this exact semester number,
 * that have not since been retaken and passed, scoped to their
 * department. Carry-over eligibility never crosses semester numbers —
 * a Semester 1 failure is only ever retaken in a future Semester 1.
 */
function findOutstandingCarryOvers(student, allResults, allCourses, allRegistrations, targetSemester) {
  const studentResults = allResults.filter(
    r => String(r.studentId) === String(student.id)
  );

  const failedAttempts = studentResults.filter(
    r => Number(r.semester) === Number(targetSemester) && r.score < 40
  );

  return failedAttempts
    .map(attempt => {
      const course = allCourses.find(c => String(c.id) === String(attempt.courseId));
      if (!course) return null;

      // Has the student since passed this exact course (any session, same semester slot)?
      const passedSince = studentResults.some(
        r =>
          String(r.courseId) === String(course.id) &&
          Number(r.semester) === Number(targetSemester) &&
          r.score >= 40 &&
          r.session > attempt.session
      );
      if (passedSince) return null;

      // Already registered for the upcoming target session/semester?
      const alreadyQueued = allRegistrations.some(
        r =>
          String(r.studentId) === String(student.id) &&
          String(r.courseId) === String(course.id) &&
          r.type === "carry-over"
      );
      if (alreadyQueued) return null;

      return { course, originalSession: attempt.session };
    })
    .filter(Boolean);
}

/**
 * Builds a preview (does not write anything) of what a "generate
 * registrations" run would create for a given level/department/session/
 * semester. Used to power the admin "Preview only" button.
 */
export async function previewRegistrationBatch({ departmentId, level, session, semester }) {
  const [students, courses, registrations, results] = await Promise.all([
    getStudents(),
    getCourses({ departmentId }),
    getRegistrations(),
    getResults(),
  ]);

  const eligibleStudents = students.filter(
    s => Number(s.departmentId) === Number(departmentId) && Number(s.level) === Number(level)
  );

  const coreCourses = courses.filter(
    c => Number(c.level) === Number(level) && Number(c.semester) === Number(semester) && c.courseType === "core"
  );

  const carryOverByStudent = eligibleStudents.map(student => ({
    student,
    carryOvers: findOutstandingCarryOvers(student, results, courses, registrations, semester),
  })).filter(entry => entry.carryOvers.length > 0);

  return {
    eligibleStudents,
    coreCourses,
    carryOverByStudent,
    totalCarryOverCount: carryOverByStudent.reduce((sum, e) => sum + e.carryOvers.length, 0),
  };
}

/**
 * Actually writes the batch: one "auto" registration per eligible
 * student per core course, plus one "auto" carry-over registration per
 * outstanding same-semester failure. Writes a single collapsed audit
 * log entry for the whole run rather than one per student.
 */
export async function generateRegistrationBatch({ departmentId, level, session, semester, actorId }) {
  const preview = await previewRegistrationBatch({ departmentId, level, session, semester });
  const { eligibleStudents, coreCourses, carryOverByStudent } = preview;

  const created = [];

  for (const student of eligibleStudents) {
    for (const course of coreCourses) {
      created.push(
        createRegistration({
          studentId: Number(student.id),
          courseId: Number(course.id),
          session,
          semester: Number(semester),
          type: "regular",
          source: "auto",
        })
      );
    }
  }

  for (const { student, carryOvers } of carryOverByStudent) {
    for (const { course, originalSession } of carryOvers) {
      created.push(
        createRegistration({
          studentId: Number(student.id),
          courseId: Number(course.id),
          session,
          semester: Number(semester),
          type: "carry-over",
          source: "auto",
          originalSession,
        })
      );
    }
  }

  await Promise.all(created);

  await createAuditLogEntry({
    entityType: "registrationBatch",
    entityId: `gen-${level}-${departmentId}-${session}-${semester}`,
    action: "generated",
    actorId,
    actorRole: "admin",
    timestamp: new Date().toISOString(),
    sessionSemester: `${session}-${semester}`,
    previousValue: null,
    newValue: {
      level,
      departmentId,
      studentsAffected: eligibleStudents.length,
      coreCoursesAssigned: coreCourses.length,
      carryOversAssigned: preview.totalCarryOverCount,
    },
    note: `Generated ${session} semester ${semester} core + carry-over registrations for level ${level}.`,
  });

  return preview;
}

/**
 * Computes a student's unit totals for a session/semester against
 * unitLoadPolicy, split by locked (core + carry-over) vs elective units
 * still needed. Used by the student confirm-registration screen.
 */
export async function getUnitLoadState({ studentId, level, session, semester }) {
  const [registrations, courses, policy] = await Promise.all([
    getRegistrations({ studentId, session, semester: Number(semester) }),
    getCourses(),
    getUnitLoadPolicy(),
  ]);

  const levelPolicy = policy.find(p => Number(p.level) === Number(level)) ?? { minUnits: 0, maxUnits: 999 };

  const withCourse = registrations
    .map(r => ({ ...r, course: courses.find(c => String(c.id) === String(r.courseId)) }))
    .filter(r => r.course);

  const lockedUnits = withCourse
    .filter(r => r.source === "auto")
    .reduce((sum, r) => sum + r.course.creditUnit, 0);

  const electiveUnits = withCourse
    .filter(r => r.source === "student")
    .reduce((sum, r) => sum + r.course.creditUnit, 0);

  const minElectiveUnitsNeeded = Math.max(0, levelPolicy.minUnits - lockedUnits);
  const maxElectiveUnitsAllowed = Math.max(0, levelPolicy.maxUnits - lockedUnits);

  return {
    lockedUnits,
    electiveUnits,
    minElectiveUnitsNeeded,
    maxElectiveUnitsAllowed,
    isWithinBand: electiveUnits >= minElectiveUnitsNeeded && electiveUnits <= maxElectiveUnitsAllowed,
    levelPolicy,
    registrations: withCourse,
  };
}