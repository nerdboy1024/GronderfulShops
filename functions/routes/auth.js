const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { db, auth } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET || 'your-secret-key-change-in-production',
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};

// ===========================
// REGISTER
// ===========================
router.post('/register',
    [
        body('email').isEmail().normalizeEmail(),
        body('password').isLength({ min: 8 }),
        body('firstName').optional().trim(),
        body('lastName').optional().trim(),
        body('emailOptIn').optional().isBoolean(),
        body('smsOptIn').optional().isBoolean(),
        body('termsAccepted').isBoolean().equals('true')
    ],
    async (req, res) => {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: 'Invalid input',
                    errors: errors.array()
                });
            }

            const { email, password, firstName, lastName, emailOptIn, smsOptIn, termsAccepted } = req.body;

            if (!termsAccepted) {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: 'You must accept the Terms & Privacy Policy'
                });
            }

            // Check if user already exists
            const usersRef = db.collection('users');
            const existingUser = await usersRef.where('email', '==', email).limit(1).get();

            if (!existingUser.empty) {
                return res.status(409).json({
                    error: 'ConflictError',
                    message: 'User with this email already exists'
                });
            }

            // Hash password
            const passwordHash = await bcrypt.hash(password, 10);

            // Create user with marketing preferences
            const userData = {
                // Basic info
                email,
                passwordHash,
                firstName: firstName || '',
                lastName: lastName || '',
                displayName: `${firstName || ''} ${lastName || ''}`.trim(),
                authProvider: 'email',

                // Role & permissions
                role: 'customer',
                permissions: [],

                // Marketing consents (GDPR-compliant - default false)
                emailOptIn: emailOptIn || false,
                smsOptIn: smsOptIn || false,
                trackingOptIn: false, // Must be explicitly opted in later
                emailFrequency: 'weekly',

                // Profile (empty on signup, filled via preferences)
                birthday: null,
                location: { city: '', country: '' },
                experienceLevel: null,
                traditions: [],
                interests: [],
                favoriteProductTypes: [],

                // Behavioral tracking
                tags: [],
                lastPurchase: null,
                lifetimeValue: 0,
                cartAbandonedCount: 0,
                emailEngagement: {
                    lastOpened: null,
                    clickedOffers: false,
                    openedLast3Emails: false
                },

                // Progressive profiling
                profileCompletionStep: 0,

                // Metadata
                createdAt: new Date(),
                updatedAt: new Date(),
                lastLogin: new Date(),
                termsAcceptedAt: new Date()
            };

            const userDoc = await usersRef.add(userData);

            // Generate token
            const token = generateToken(userDoc.id);

            res.status(201).json({
                message: 'User registered successfully',
                token,
                user: {
                    id: userDoc.id,
                    email,
                    firstName,
                    lastName,
                    role: 'customer',
                    profileCompletionStep: 0
                }
            });
        } catch (error) {
            console.error('Register error:', error);
            res.status(500).json({
                error: 'ServerError',
                message: 'Failed to register user'
            });
        }
    }
);

// ===========================
// LOGIN
// ===========================
router.post('/login',
    [
        body('email').isEmail().normalizeEmail(),
        body('password').notEmpty()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: 'Invalid input',
                    errors: errors.array()
                });
            }

            const { email, password } = req.body;

            // Find user
            const usersRef = db.collection('users');
            const userSnapshot = await usersRef.where('email', '==', email).limit(1).get();

            if (userSnapshot.empty) {
                return res.status(401).json({
                    error: 'AuthenticationError',
                    message: 'Invalid credentials'
                });
            }

            const userDoc = userSnapshot.docs[0];
            const user = userDoc.data();

            // Verify password
            const validPassword = await bcrypt.compare(password, user.passwordHash);

            if (!validPassword) {
                return res.status(401).json({
                    error: 'AuthenticationError',
                    message: 'Invalid credentials'
                });
            }

            // Generate token
            const token = generateToken(userDoc.id);

            res.json({
                message: 'Login successful',
                token,
                user: {
                    id: userDoc.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                error: 'ServerError',
                message: 'Failed to login'
            });
        }
    }
);

// ===========================
// GOOGLE SIGN-IN
// ===========================
router.post('/google',
    [
        body('idToken').notEmpty(),
        body('emailOptIn').optional().isBoolean(),
        body('smsOptIn').optional().isBoolean(),
        body('termsAccepted').optional().isBoolean()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: 'Invalid input',
                    errors: errors.array()
                });
            }

            const { idToken, emailOptIn, smsOptIn, termsAccepted } = req.body;

            // Verify Google ID token
            const decodedToken = await auth.verifyIdToken(idToken);
            const { uid, email, name, picture } = decodedToken;

            // Check if user exists
            const usersRef = db.collection('users');
            const userDoc = await usersRef.doc(uid).get();

            let userData;
            let isNewUser = false;

            if (!userDoc.exists) {
                // New user - create account
                isNewUser = true;

                // Split name into first and last
                const nameParts = (name || '').split(' ');
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';

                userData = {
                    // Basic info
                    email,
                    firstName,
                    lastName,
                    displayName: name || '',
                    photoURL: picture || '',
                    authProvider: 'google',

                    // Role & permissions
                    role: 'customer',
                    permissions: [],

                    // Marketing consents (GDPR-compliant)
                    emailOptIn: emailOptIn || false,
                    smsOptIn: smsOptIn || false,
                    trackingOptIn: false,
                    emailFrequency: 'weekly',

                    // Profile
                    birthday: null,
                    location: { city: '', country: '' },
                    experienceLevel: null,
                    traditions: [],
                    interests: [],
                    favoriteProductTypes: [],

                    // Behavioral tracking
                    tags: [],
                    lastPurchase: null,
                    lifetimeValue: 0,
                    cartAbandonedCount: 0,
                    emailEngagement: {
                        lastOpened: null,
                        clickedOffers: false,
                        openedLast3Emails: false
                    },

                    // Progressive profiling
                    profileCompletionStep: 0,

                    // Metadata
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastLogin: new Date(),
                    termsAcceptedAt: termsAccepted ? new Date() : null
                };

                await usersRef.doc(uid).set(userData);
            } else {
                // Existing user - update last login
                userData = userDoc.data();
                await usersRef.doc(uid).update({
                    lastLogin: new Date(),
                    updatedAt: new Date()
                });
            }

            // Generate JWT token
            const token = generateToken(uid);

            res.status(isNewUser ? 201 : 200).json({
                message: isNewUser ? 'User registered successfully' : 'Login successful',
                token,
                isNewUser,
                user: {
                    id: uid,
                    email: userData.email,
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    displayName: userData.displayName,
                    photoURL: userData.photoURL,
                    role: userData.role,
                    profileCompletionStep: userData.profileCompletionStep || 0
                }
            });
        } catch (error) {
            console.error('Google sign-in error:', error);
            res.status(500).json({
                error: 'ServerError',
                message: 'Failed to authenticate with Google'
            });
        }
    }
);

// ===========================
// GET CURRENT USER
// ===========================
router.get('/me', authenticateToken, async (req, res) => {
    res.json({
        user: req.user
    });
});

module.exports = router;
