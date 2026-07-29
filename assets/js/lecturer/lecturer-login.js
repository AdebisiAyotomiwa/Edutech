import { lecturerLogin, isLecturerLoggedIn } from "../lecturerAuth.js";

/* =========================================================
   lecturer-login.js
   ---------------------------------------------------------
   Handles the Lecturer Login page UI and form submission.
   ========================================================= */

// If already logged in, skip straight to the dashboard
if (isLecturerLoggedIn()) {
  window.location.href = "/assets/pages/lecturer/lecturer-dashboard.html";
}

/* ── DOM refs ───────────────────────────────────────────── */
const form        = document.getElementById("lecturerLoginForm");
const emailInput  = document.getElementById("lecturerEmailInput");
const passInput   = document.getElementById("lecturerPasswordInput");
const alertEl     = document.getElementById("lecturerLoginAlert");
const loginBtn    = document.getElementById("lecturerLoginBtn");
const spinner     = document.getElementById("lecturerLoginSpinner");
const btnLabel    = loginBtn.querySelector(".btn-label");
const toggleBtn   = document.getElementById("toggleLecturerPassword");

/* ── Form submit ────────────────────────────────────────── */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert();

  const email    = emailInput.value.trim();
  const password = passInput.value.trim();

  if (!email || !password) {
    showAlert("Please enter your email and password.");
    return;
  }

  setLoading(true);
  try {
    const result = await lecturerLogin(email, password);
    if (!result.success) {
      showAlert(result.message);
      return;
    }
    window.location.href = "/assets/pages/lecturer/lecturer-dashboard.html";
  } catch (err) {
    console.error(err);
    showAlert("Unable to connect to the server. Is it running?");
  } finally {
    setLoading(false);
  }
});

/* ── Password toggle ────────────────────────────────────── */
toggleBtn.addEventListener("click", () => {
  const show = passInput.type === "password";
  passInput.type = show ? "text" : "password";
  toggleBtn.querySelector("i").classList.toggle("bi-eye",      !show);
  toggleBtn.querySelector("i").classList.toggle("bi-eye-slash", show);
});

/* ── Helpers ────────────────────────────────────────────── */
function showAlert(msg) { alertEl.textContent = msg; alertEl.classList.remove("d-none"); }
function hideAlert()    { alertEl.textContent = "";  alertEl.classList.add("d-none"); }

function setLoading(loading) {
  loginBtn.disabled    = loading;
  spinner.classList.toggle("d-none", !loading);
  btnLabel.textContent = loading ? "Signing in…" : "Sign In";
}
