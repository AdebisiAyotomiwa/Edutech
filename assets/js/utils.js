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