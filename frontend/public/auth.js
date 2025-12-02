// ===========================
// FIREBASE AUTH
// ===========================

import { auth } from '/firebase-config.js';
import {
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ===========================
// CONFIGURATION
// ===========================

const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5000/api'
    : 'https://YOUR_DOMAIN.com/api';

// ===========================
// DOM ELEMENTS
// ===========================

const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const authTabs = document.querySelectorAll('.auth-tab');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const googleSignUpBtn = document.getElementById('googleSignUpBtn');

const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');

// ===========================
// TAB SWITCHING
// ===========================

authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');

        // Update tab styles
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show/hide forms
        document.getElementById('loginForm').classList.remove('active');
        document.getElementById('signupForm').classList.remove('active');

        if (tabName === 'login') {
            document.getElementById('loginForm').classList.add('active');
        } else {
            document.getElementById('signupForm').classList.add('active');
        }

        // Clear messages
        hideError();
        hideSuccess();
    });
});

// ===========================
// MESSAGE HELPERS
// ===========================

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    successMessage.style.display = 'none';
}

function hideError() {
    errorMessage.style.display = 'none';
}

function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    errorMessage.style.display = 'none';
}

function hideSuccess() {
    successMessage.style.display = 'none';
}

// ===========================
// EMAIL/PASSWORD LOGIN
// ===========================

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();
    hideSuccess();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    const submitBtn = loginForm.querySelector('.submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
        // Sign in with Firebase
        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        // Get ID token
        const idToken = await userCredential.user.getIdToken();

        // Store token
        localStorage.setItem('authToken', idToken);
        localStorage.setItem('userId', userCredential.user.uid);

        showSuccess('Login successful! Redirecting...');

        // Redirect after short delay
        setTimeout(() => {
            window.location.href = '/';
        }, 1000);

    } catch (error) {
        console.error('Login error:', error);
        showError(getErrorMessage(error.code));
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
    }
});

// ===========================
// EMAIL/PASSWORD SIGNUP
// ===========================

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();
    hideSuccess();

    const firstName = document.getElementById('signupFirstName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const emailOptIn = document.getElementById('emailOptIn').checked;
    const smsOptIn = document.getElementById('smsOptIn').checked;
    const termsAccepted = document.getElementById('termsAccepted').checked;

    if (!termsAccepted) {
        showError('You must accept the Terms & Privacy Policy');
        return;
    }

    const submitBtn = signupForm.querySelector('.submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
        // Call backend to create account
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                password,
                firstName,
                emailOptIn,
                smsOptIn,
                termsAccepted
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Registration failed');
        }

        // Store token
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userId', data.user.id);

        showSuccess('Account created! Redirecting to preferences...');

        // Redirect to preferences page
        setTimeout(() => {
            window.location.href = '/preferences.html';
        }, 1500);

    } catch (error) {
        console.error('Signup error:', error);
        showError(error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
    }
});

// ===========================
// GOOGLE SIGN-IN
// ===========================

async function handleGoogleSignIn(isSignup = false) {
    hideError();
    hideSuccess();

    const provider = new GoogleAuthProvider();

    try {
        // Show Google sign-in popup
        const result = await signInWithPopup(auth, provider);

        // Get ID token
        const idToken = await result.user.getIdToken();

        // If signup, prompt for marketing preferences
        let emailOptIn = false;
        let smsOptIn = false;
        let termsAccepted = false;

        if (isSignup) {
            // For new signups via Google, get consent
            emailOptIn = document.getElementById('emailOptIn')?.checked || false;
            smsOptIn = document.getElementById('smsOptIn')?.checked || false;
            termsAccepted = confirm('By continuing, you agree to our Terms & Privacy Policy');

            if (!termsAccepted) {
                showError('You must accept the Terms & Privacy Policy');
                return;
            }
        }

        // Call backend Google auth endpoint
        const response = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                idToken,
                emailOptIn,
                smsOptIn,
                termsAccepted
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Google sign-in failed');
        }

        // Store token
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userId', data.user.id);

        showSuccess('Signed in successfully! Redirecting...');

        // If new user, redirect to preferences, otherwise to home
        setTimeout(() => {
            if (data.isNewUser) {
                window.location.href = '/preferences.html';
            } else {
                window.location.href = '/';
            }
        }, 1000);

    } catch (error) {
        console.error('Google sign-in error:', error);
        if (error.code === 'auth/popup-closed-by-user') {
            showError('Sign-in cancelled');
        } else {
            showError(getErrorMessage(error.code) || error.message);
        }
    }
}

googleSignInBtn.addEventListener('click', () => handleGoogleSignIn(false));
googleSignUpBtn.addEventListener('click', () => handleGoogleSignIn(true));

// ===========================
// ERROR MESSAGES
// ===========================

function getErrorMessage(errorCode) {
    const errorMessages = {
        'auth/invalid-email': 'Invalid email address',
        'auth/user-disabled': 'This account has been disabled',
        'auth/user-not-found': 'Invalid credentials',
        'auth/wrong-password': 'Invalid credentials',
        'auth/email-already-in-use': 'Email already in use',
        'auth/weak-password': 'Password should be at least 8 characters',
        'auth/operation-not-allowed': 'Operation not allowed',
        'auth/too-many-requests': 'Too many attempts. Please try again later'
    };

    return errorMessages[errorCode] || 'An error occurred. Please try again.';
}

// ===========================
// CHECK IF ALREADY LOGGED IN
// ===========================

const authToken = localStorage.getItem('authToken');
if (authToken) {
    // User is already logged in, redirect to home
    window.location.href = '/';
}
