const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
// Cloud Functions: Use default credentials (auto-configured)
// Local: Use service account file
let initConfig = {
    storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app'  // TODO: Replace with your Firebase Storage bucket
};

if (process.env.FUNCTIONS_EMULATOR || process.env.FIREBASE_CONFIG) {
    // Running in Cloud Functions or emulator - use default credentials
    console.log('✓ Using Firebase Cloud Functions default credentials');
} else {
    // Local development: Use service account file
    try {
        const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));
        initConfig.credential = admin.credential.cert(serviceAccount);
        console.log('✓ Using serviceAccountKey.json for local development');
    } catch (error) {
        console.warn('⚠ serviceAccountKey.json not found, using application default credentials');
    }
}

admin.initializeApp(initConfig);

// Get Firestore instance
const db = admin.firestore();

// Get Auth instance
const auth = admin.auth();

// Get Storage instance
const bucket = admin.storage().bucket();

module.exports = {
    admin,
    db,
    auth,
    bucket
};
