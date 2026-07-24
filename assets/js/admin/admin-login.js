import { adminLogin, isAdminLoggedIn } from "../adminAuth.js";

/* =========================================================
   admin-login.js
   ---------------------------------------------------------
   Handles everything related to the Admin Login page UI.
   ========================================================= */

// Already signed in? Skip straight to the dashboard.
if (isAdminLoggedIn()) {
  window.location.href = "/assets/pages/admin/admin-dashboard.html";
}

const adminLoginForm = document.querySelector("#adminLoginForm");

const emailInput = document.querySelector("#adminEmailInput");
const passwordInput = document.querySelector("#adminPasswordInput");

const loginAlert = document.querySelector("#adminLoginAlert");

const loginButton = document.querySelector("#adminLoginBtn");
const loginSpinner = document.querySelector("#adminLoginSpinner");
const buttonLabel = loginButton.querySelector(".btn-label");

/* ========================================================= */

adminLoginForm.addEventListener("submit", handleLogin);

/* ========================================================= */

async function handleLogin(event) {
  event.preventDefault();

  hideAlert();

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    showAlert("Please enter your email and password.");
    return;
  }

  setLoading(true);

  try {
    const result = await adminLogin(email, password);

    if (!result.success) {
      showAlert(result.message);
      return;
    }

    window.location.href = "/assets/pages/admin/admin-dashboard.html";
  } catch (error) {
    console.error(error);
    showAlert("Unable to connect to the server.");
  } finally {
    setLoading(false);
  }
}

/* ========================================================= */

function showAlert(message) {
  loginAlert.textContent = message;
  loginAlert.classList.remove("d-none");
}

function hideAlert() {
  loginAlert.textContent = "";
  loginAlert.classList.add("d-none");
}

/* ========================================================= */

function setLoading(isLoading) {
  loginButton.disabled = isLoading;
  loginSpinner.classList.toggle("d-none", !isLoading);
  buttonLabel.textContent = isLoading ? "Signing in..." : "Login";
}

const togglePassword = document.querySelector("#toggleAdminPassword");
const toggleIcon = togglePassword.querySelector("i");

togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  toggleIcon.classList.toggle("bi-eye");
  toggleIcon.classList.toggle("bi-eye-slash");
});
