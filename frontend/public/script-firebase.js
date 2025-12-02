// Firebase initialization for GronderfulShops
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// TODO: Replace with your Firebase configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// API Configuration
// TODO: Replace with your Cloud Functions URL
const API_BASE_URL = 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api';

// Auth state management
let currentUser = null;
let currentUserData = null;

// Initialize auth state listener
onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                currentUserData = userDoc.data();
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        }

        // Show logged in UI
        updateAuthUI(true);
    } else {
        currentUserData = null;
        updateAuthUI(false);
    }
});

// Update UI based on auth state
function updateAuthUI(isLoggedIn) {
    const guestNav = document.getElementById('authNavGuest');
    const userNav = document.getElementById('authNavUser');
    const adminLink = document.getElementById('adminLink');

    if (guestNav) guestNav.style.display = isLoggedIn ? 'none' : 'block';
    if (userNav) userNav.style.display = isLoggedIn ? 'block' : 'none';

    if (isLoggedIn && currentUserData) {
        const userName = document.getElementById('navUserName');
        if (userName) {
            userName.textContent = currentUserData.displayName || currentUser.email.split('@')[0];
        }

        // Show admin link if user is admin
        if (adminLink && currentUserData.role === 'GronderfulBlogs') {
            adminLink.style.display = 'block';
            adminLink.href = '/admin/';
        }
    }
}

// Sign out function
async function handleSignOut() {
    try {
        await signOut(auth);
        window.location.href = '/';
    } catch (error) {
        console.error('Sign out error:', error);
    }
}

// API helper function
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    // Add auth token if user is logged in
    if (currentUser) {
        const token = await currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'API request failed');
    }

    return response.json();
}

// Export for use in other modules
window.FirebaseApp = {
    auth,
    db,
    currentUser: () => currentUser,
    currentUserData: () => currentUserData,
    apiRequest,
    handleSignOut,
    API_BASE_URL
};

// Initialize sign out button
document.addEventListener('DOMContentLoaded', () => {
    const signOutBtn = document.getElementById('navSignOut');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', handleSignOut);
    }
});
