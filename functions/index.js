/**
 * Firebase Cloud Functions
 * Hosts the Express backend as a Cloud Function
 */

const functions = require('firebase-functions');
const app = require('./server');

// Export the Express app as a Cloud Function
exports.api = functions.https.onRequest(app);
