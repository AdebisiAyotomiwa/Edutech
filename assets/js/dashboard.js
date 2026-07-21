import { requireAuth, getCurrentStudent, logout } from "./auth.js";

import { getResults, getCourses, getDepartmentById } from "./api.js";

import { calculateGPA, getStudentDisplayName, scoreToGrade } from "./utils.js";

/* ==========================================================
   Protect Dashboard
========================================================== */

requireAuth();

/* ==========================================================
   Global Variables
========================================================== */

let student = null;
let results = [];
let courses = [];
let department = null;
let resultsWithCourses = [];
let gpaTrend = [];

/* ==========================================================
   DOM Elements
========================================================== */

const dashboardBody = document.getElementById("dashboardBody");
const greetingName = document.getElementById("greetingName");

const sidebarUserName = document.getElementById("sidebarUserName");
const sidebarUserMeta = document.getElementById("sidebarUserMeta");

const sidebarAvatarImg = document.getElementById("sidebarAvatarImg");
const sidebarAvatarInitials = document.getElementById("sidebarAvatarInitials");

const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar = document.getElementById("appSidebar");
const appSidebarScrim = document.getElementById("appSidebarScrim");

const logoutBtn = document.getElementById("logoutBtn");

/* ==========================================================
   Start App
========================================================== */

document.addEventListener("DOMContentLoaded", initDashboard);

async function initDashboard() {
  try {
    student = getCurrentStudent();

    if (!student) {
      window.location.href = "/pages/login.html";
      return;
    }

    initialiseSidebar();

    initialiseLogout();

    await loadStudentData();

    renderDashboard();
  } catch (error) {
    console.error(error);

    dashboardBody.innerHTML = `
      <div class="alert alert-danger">
          Failed to load dashboard.
      </div>
    `;
  }
}

/* ==========================================================
   Load Student Data
========================================================== */

async function loadStudentData() {
  results = await getResults({
    
    studentId: student.id,
  });
    
  courses = await getCourses();

  

  department = await getDepartmentById(student.departmentId);

  resultsWithCourses = results.map((result) => {
    const course = courses.find((c) => c.id === result.courseId);
   
    

    if (!course) {
      console.warn("Course not found:", result.courseId);

      return {
        ...result,

        courseCode: "N/A",

        courseTitle: "Unknown Course",

        creditUnit: 0,
      };
    }

    return {
      ...result,

      courseCode: course.courseCode,

      courseTitle: course.courseTitle,

      creditUnit: course.creditUnit,
    };
  });
}

/* ==========================================================
   Sidebar
========================================================== */

function initialiseSidebar() {
  greetingName.textContent = getStudentDisplayName(student);

  sidebarUserName.textContent = `${student.firstName} ${student.lastName}`;

  sidebarUserMeta.textContent = student.matricNumber;

  if (student.profileImage && student.profileImage.trim() !== "") {
    sidebarAvatarImg.src = student.profileImage;

    sidebarAvatarImg.onerror = () => {
      sidebarAvatarImg.classList.add("d-none");
      sidebarAvatarInitials.style.display = "flex";
      sidebarAvatarInitials.textContent =
        student.firstName.charAt(0) + student.lastName.charAt(0);
    };

    sidebarAvatarImg.classList.remove("d-none");

    sidebarAvatarInitials.style.display = "none";
  } else {
    sidebarAvatarInitials.style.display = "flex";

    sidebarAvatarInitials.textContent =
      student.firstName.charAt(0) + student.lastName.charAt(0);
  }

  // else {

  //     sidebarAvatarInitials.textContent =
  //         student.firstName.charAt(0) +
  //         student.lastName.charAt(0);

  // }

  sidebarToggleBtn.addEventListener("click", () => {
    appSidebar.classList.toggle("show");

    appSidebarScrim.classList.toggle("show");
  });

  appSidebarScrim.addEventListener("click", () => {
    appSidebar.classList.remove("show");

    appSidebarScrim.classList.remove("show");
  });
}

/* ==========================================================
   Logout
========================================================== */

function initialiseLogout() {
  logoutBtn.addEventListener("click", () => {
    logout();

    window.location.href = "/pages/login.html";
  });
}

/* ==========================================================
   Render Dashboard
========================================================== */

function renderDashboard() {
  const totalCourses = resultsWithCourses.length;

  const totalCredits = resultsWithCourses.reduce(
    (sum, result) => sum + result.creditUnit,
    0,
  );

  const cgpa = calculateGPA(resultsWithCourses);

  dashboardBody.innerHTML = `

        <div class="row g-4 mb-4">

            <div class="col-md-4">
                <div class="card shadow-sm h-100">

                    <div class="card-body">

                        <h6 class="text-muted">
                            Current CGPA
                        </h6>

                        <h2 class="fw-bold text-primary">
                            ${cgpa}
                        </h2>

                    </div>

                </div>
            </div>

            <div class="col-md-4">

                <div class="card shadow-sm h-100">

                    <div class="card-body">

                        <h6 class="text-muted">
                            Total Courses
                        </h6>

                        <h2 class="fw-bold">
                            ${totalCourses}
                        </h2>

                    </div>

                </div>

            </div>

            <div class="col-md-4">

                <div class="card shadow-sm h-100">

                    <div class="card-body">

                        <h6 class="text-muted">
                            Total Credit Units
                        </h6>

                        <h2 class="fw-bold">
                            ${totalCredits}
                        </h2>

                    </div>

                </div>

            </div>

        </div>

        <div class="row g-4">

            <div class="col-lg-8">

                <div class="card shadow-sm">

                    <div class="card-header fw-semibold">
                        Recent Results
                    </div>

                    <div class="card-body p-0">

                        <div class="table-responsive">

                            <table class="table table-hover align-middle mb-0">

                                <thead>

                                    <tr>

                                        <th>Course</th>

                                        <th>Title</th>

                                        <th>Score</th>

                                        <th>Grade</th>

                                    </tr>

                                </thead>

                                <tbody id="recentResultsTable">

                                </tbody>

                            </table>

                        </div>

                    </div>

                </div>

            </div>

            <div class="col-lg-4">

                <div class="card shadow-sm">

                    <div class="card-header fw-semibold">

                        Academic Summary

                    </div>

                    <div class="card-body">

                        <p>

                            <strong>Name:</strong><br>

                            ${student.firstName} ${student.lastName}

                        </p>

                        <p>

                            <strong>Matric No:</strong><br>

                            ${student.matricNumber}

                        </p>

                        <p>

                            <strong>Department:</strong><br>

                            ${department.name}

                        </p>

                        <p>

                            <strong>Programme:</strong><br>

                            ${student.programme}

                        </p>

                        <p>

                            <strong>Current Level:</strong><br>

                            ${student.level} Level

                        </p>

                    </div>

                </div>

            </div>

        </div>

        <div class="card shadow-sm mt-4">

            <div class="card-header fw-semibold">

                GPA Trend

            </div>

            <div class="card-body">

                <canvas id="gpaChart"></canvas>

            </div>

        </div>

    `;

  renderRecentResults();

//   renderChart();
if (typeof Chart !== "undefined") {
    renderChart();
}
}

/* ==========================================================
   Recent Results Table
========================================================== */

function renderRecentResults() {
  const table = document.getElementById("recentResultsTable");

  table.innerHTML = "";

  const latest = [...resultsWithCourses].reverse().slice(0, 6);

  latest.forEach((result) => {
    const grade = scoreToGrade(result.score);

    table.innerHTML += `

            <tr>

                <td>${result.courseCode}</td>

                <td>${result.courseTitle}</td>

                <td>${result.score}</td>

                <td>

                    <span class="badge bg-primary">

                        ${grade.grade}

                    </span>

                </td>

            </tr>

        `;
  });
}

/* ==========================================================
   GPA Trend Chart
========================================================== */

function renderChart() {
  const canvas = document.getElementById("gpaChart");

  if (!canvas) return;

  // Destroy previous chart if it exists
  if (window.gpaChart instanceof Chart) {
    window.gpaChart.destroy();
  }

  // Group results by session and semester
  const grouped = {};

  resultsWithCourses.forEach((result) => {
    const key = `${result.session} - Semester ${result.semester}`;

    if (!grouped[key]) {
      grouped[key] = [];
    }

    grouped[key].push(result);
  });

  const labels = [];
  const values = [];

  Object.entries(grouped).forEach(([label, records]) => {
    labels.push(label);

    values.push(Number(calculateGPA(records)));
  });

  window.gpaChart = new Chart(canvas, {
    type: "line",

    data: {
      labels,

      datasets: [
        {
          label: "GPA",

          data: values,

          borderWidth: 3,

          tension: 0.35,

          fill: false,
        },
      ],
    },

    options: {
      responsive: true,

      maintainAspectRatio: false,

      scales: {
        y: {
          beginAtZero: true,

          max: 5,
        },
      },
    },
  });
}
