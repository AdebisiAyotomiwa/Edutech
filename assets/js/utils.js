export function scoreToGrade(score) {
  if (score >= 70) return { grade: "A", point: 5 };
  if (score >= 60) return { grade: "B", point: 4 };
  if (score >= 50) return { grade: "C", point: 3 };
  if (score >= 45) return { grade: "D", point: 2 };
  if (score >= 40) return { grade: "E", point: 1 };

  return { grade: "F", point: 0 };
}

export function calculateGPA(resultsWithCourses) {
  const totalPoints = resultsWithCourses.reduce(
    (sum, result) =>
      sum + scoreToGrade(result.score).point * result.creditUnit,
    0
  );

  const totalCredits = resultsWithCourses.reduce(
    (sum, result) => sum + result.creditUnit,
    0
  );

  return (totalPoints / totalCredits).toFixed(2);
}

export function getStudentDisplayName(student) {
  return student.firstName;
}

/* ========================================================
   Unit-aware graduation eligibility (Step 5)
   Pass mark mirrors scoreToGrade: score >= 40 is a pass.
   Each course counts once toward units (best/only passing
   attempt on record), so carry-over retakes don't double-count.
======================================================== */
export function computeGraduationEligibility(student, results, courses, department, graduationRequirements) {
  if (!student || !department) return null;

  const requirement = (graduationRequirements || []).find(
    (r) => Number(r.durationYears) === Number(department.durationYears)
  );
  if (!requirement) return null;

  const passed = (results || []).filter(
    (r) => r.published !== false && Number(r.score) >= 40
  );

  const countedCourseIds = new Set();
  let totalUnits = 0;
  let coreUnits = 0;

  passed.forEach((r) => {
    const course = courses.find((c) => Number(c.id) === Number(r.courseId));
    if (!course) return;
    if (countedCourseIds.has(course.id)) return; // count each course once
    countedCourseIds.add(course.id);
    totalUnits += Number(course.creditUnit) || 0;
    if (course.courseType === "core") coreUnits += Number(course.creditUnit) || 0;
  });

  const unitsShort = Math.max(0, requirement.minTotalUnits - totalUnits);
  const coreShort = Math.max(0, requirement.minCoreUnits - coreUnits);

  let status = "eligible";
  if (unitsShort > 0 && coreShort > 0) status = "short-both";
  else if (coreShort > 0) status = "short-core";
  else if (unitsShort > 0) status = "short-total";

  return {
    totalUnits,
    coreUnits,
    minTotalUnits: requirement.minTotalUnits,
    minCoreUnits: requirement.minCoreUnits,
    unitsShort,
    coreShort,
    status, // "eligible" | "short-total" | "short-core" | "short-both"
  };
}