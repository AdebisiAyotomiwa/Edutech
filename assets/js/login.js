import { login } from "./auth.js";

/* =========================================================
   login.js
   ---------------------------------------------------------
   Handles everything related to the Login page UI.
   ========================================================= */

const loginForm = document.querySelector("#loginForm");

const identifierInput = document.querySelector("#identifierInput");
const passwordInput = document.querySelector("#passwordInput");

const loginAlert = document.querySelector("#loginAlert");

const loginButton = document.querySelector("#loginBtn");
const loginSpinner = document.querySelector("#loginSpinner");
const buttonLabel = loginButton.querySelector(".btn-label");

/* ========================================================= */

loginForm.addEventListener("submit", handleLogin);

/* ========================================================= */

async function handleLogin(event) {
  event.preventDefault();

  hideAlert();

  const identifier = identifierInput.value.trim();
  const password = passwordInput.value.trim();

  /* ------------------------------
       Basic Validation
    ------------------------------ */

  if (!identifier || !password) {
    showAlert("Please enter your email/matric number and password.");

    return;
  }

  /* ------------------------------
       Show Loading State
    ------------------------------ */

  setLoading(true);

  try {
    const result = await login(identifier, password);

    if (!result.success) {
      showAlert(result.message);

      return;
    }

    // Login successful

    window.location.href = "welcome.html";
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

const togglePassword = document.querySelector("#togglePassword");
const toggleIcon = togglePassword.querySelector("i");

togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";

  passwordInput.type = isPassword ? "text" : "password";

  toggleIcon.classList.toggle("bi-eye");
  toggleIcon.classList.toggle("bi-eye-slash");
});
