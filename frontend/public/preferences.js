// ===========================
// USER PREFERENCES PAGE
// ===========================

import { auth } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5000/api'
    : 'https://YOUR_DOMAIN.com/api';

const messageContainer = document.getElementById('messageContainer');
const preferencesForm = document.getElementById('preferencesForm');
const logoutBtn = document.getElementById('logoutBtn');

let currentUser = null;

// ===========================
// CHECK AUTH
// ===========================

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '/auth.html';
    } else {
        currentUser = user;
        loadPreferences();
    }
});

// ===========================
// LOAD PREFERENCES
// ===========================

async function loadPreferences() {
    try {
        if (!currentUser) {
            console.error('No user logged in');
            return;
        }

        // Get fresh Firebase ID token
        const idToken = await currentUser.getIdToken();

        const response = await fetch(`${API_URL}/users/me/preferences`, {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load preferences');
        }

        const data = await response.json();
        const prefs = data.preferences;

        // Populate form with existing preferences
        // Birthday
        if (prefs.birthday) {
            const { month, day } = prefs.birthday;
            document.getElementById('birthday').value = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }

        // Location
        if (prefs.location) {
            document.getElementById('city').value = prefs.location.city || '';
            document.getElementById('country').value = prefs.location.country || '';
        }

        // Experience level
        if (prefs.experienceLevel) {
            const radio = document.querySelector(`input[name="experienceLevel"][value="${prefs.experienceLevel}"]`);
            if (radio) radio.checked = true;
        }

        // Traditions
        if (prefs.traditions && prefs.traditions.length > 0) {
            prefs.traditions.forEach(tradition => {
                const checkbox = document.querySelector(`input[value="${tradition}"]`);
                if (checkbox) checkbox.checked = true;
            });
        }

        // Favorite product types
        if (prefs.favoriteProductTypes && prefs.favoriteProductTypes.length > 0) {
            prefs.favoriteProductTypes.forEach(product => {
                const checkbox = document.getElementById(`prod-${product}`);
                if (checkbox) checkbox.checked = true;
            });
        }

        // Marketing preferences
        document.getElementById('emailOptIn').checked = prefs.emailOptIn || false;
        document.getElementById('smsOptIn').checked = prefs.smsOptIn || false;
        document.getElementById('trackingOptIn').checked = prefs.trackingOptIn || false;
        document.getElementById('emailFrequency').value = prefs.emailFrequency || 'weekly';

        // Community
        document.getElementById('blogSubscription').checked = prefs.blogSubscription || false;
        document.getElementById('workshopInterest').checked = prefs.workshopInterest || false;

    } catch (error) {
        console.error('Load preferences error:', error);
        showMessage('Failed to load preferences', 'error');
    }
}

// ===========================
// SAVE PREFERENCES
// ===========================

preferencesForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = preferencesForm.querySelector('.save-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
        // Parse birthday
        let birthday = null;
        const birthdayValue = document.getElementById('birthday').value;
        if (birthdayValue && birthdayValue.includes('-')) {
            const parts = birthdayValue.split('-');
            const month = parseInt(parts[0], 10);
            const day = parseInt(parts[1], 10);

            // Validate month and day
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                birthday = { month, day };
            }
        }

        // Get location
        const location = {
            city: document.getElementById('city').value,
            country: document.getElementById('country').value
        };

        // Get experience level
        const experienceLevel = document.querySelector('input[name="experienceLevel"]:checked')?.value || null;

        // Get traditions
        const traditions = [];
        document.querySelectorAll('input[id^="trad-"]:checked').forEach(checkbox => {
            traditions.push(checkbox.value);
        });

        // Get favorite product types
        const favoriteProductTypes = [];
        document.querySelectorAll('input[id^="prod-"]:checked').forEach(checkbox => {
            favoriteProductTypes.push(checkbox.value);
        });

        // Get marketing preferences
        const emailOptIn = document.getElementById('emailOptIn').checked;
        const smsOptIn = document.getElementById('smsOptIn').checked;
        const trackingOptIn = document.getElementById('trackingOptIn').checked;
        const emailFrequency = document.getElementById('emailFrequency').value;

        // Get community preferences
        const blogSubscription = document.getElementById('blogSubscription').checked;
        const workshopInterest = document.getElementById('workshopInterest').checked;

        // Prepare payload
        const preferences = {
            birthday,
            location,
            experienceLevel,
            traditions,
            favoriteProductTypes,
            emailOptIn,
            smsOptIn,
            trackingOptIn,
            emailFrequency,
            blogSubscription,
            workshopInterest
        };

        // Get fresh Firebase ID token
        const idToken = await currentUser.getIdToken();

        // Send to backend
        const response = await fetch(`${API_URL}/users/me/preferences`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(preferences)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to save preferences');
        }

        showMessage('Preferences saved successfully!', 'success');

        // Scroll to top to show message
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (error) {
        console.error('Save preferences error:', error);
        showMessage(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Preferences';
    }
});

// ===========================
// LOGOUT
// ===========================

logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    if (confirm('Are you sure you want to logout?')) {
        try {
            // Import signOut if not already imported
            const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            await signOut(auth);
            localStorage.removeItem('authToken');
            localStorage.removeItem('userId');
            window.location.href = '/auth.html';
        } catch (error) {
            console.error('Logout error:', error);
            // Still redirect even if signout fails
            window.location.href = '/auth.html';
        }
    }
});

// ===========================
// HELPER FUNCTIONS
// ===========================

function showMessage(message, type) {
    messageContainer.textContent = message;
    messageContainer.className = `message ${type}`;
    messageContainer.style.display = 'block';

    setTimeout(() => {
        messageContainer.style.display = 'none';
    }, 5000);
}

// ===========================
// INITIALIZE
// ===========================

// loadPreferences() is now called from onAuthStateChanged after user is confirmed
