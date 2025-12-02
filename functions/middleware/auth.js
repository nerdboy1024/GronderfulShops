const { auth, db } = require('../config/firebase');

// API Key authentication for remote admin (postmaster.center)
const authenticateApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'API key required'
            });
        }

        // Look up API key in Firestore
        const keyDoc = await db.collection('apiKeys')
            .where('key', '==', apiKey)
            .where('isActive', '==', true)
            .limit(1)
            .get();

        if (keyDoc.empty) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid API key'
            });
        }

        const keyData = keyDoc.docs[0].data();

        // Check if key has expired
        if (keyData.expiresAt && keyData.expiresAt.toDate() < new Date()) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'API key has expired'
            });
        }

        // Check allowed origins (for postmaster.center)
        const origin = req.headers['origin'] || req.headers['referer'] || '';
        if (keyData.allowedOrigins && keyData.allowedOrigins.length > 0) {
            const isAllowed = keyData.allowedOrigins.some(allowed =>
                origin.includes(allowed)
            );
            if (!isAllowed && origin) {
                console.warn(`API key used from unauthorized origin: ${origin}`);
                // Log but don't block for now - allows server-to-server calls
            }
        }

        // Update last used timestamp
        await db.collection('apiKeys').doc(keyDoc.docs[0].id).update({
            lastUsedAt: new Date(),
            usageCount: (keyData.usageCount || 0) + 1
        });

        // Attach API key info to request
        req.apiKey = {
            id: keyDoc.docs[0].id,
            name: keyData.name,
            permissions: keyData.permissions || ['read', 'write'],
            ...keyData
        };

        // Create a synthetic admin user for API key access
        req.user = {
            id: `apikey_${keyDoc.docs[0].id}`,
            email: keyData.email || 'api@postmaster.center',
            role: 'GronderfulBlogs',
            isApiKeyAuth: true
        };

        next();
    } catch (error) {
        console.error('API Key auth error:', error);
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'API key validation failed'
        });
    }
};

// Authenticate via either Firebase token OR API key
const authenticateTokenOrApiKey = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];

    if (apiKey) {
        return authenticateApiKey(req, res, next);
    } else if (authHeader) {
        return authenticateToken(req, res, next);
    } else {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required (Bearer token or X-API-Key)'
        });
    }
};

// Verify Firebase ID token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Access token required'
            });
        }

        // Verify Firebase token
        const decodedToken = await auth.verifyIdToken(token);

        // Get user document from Firestore
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();

        if (!userDoc.exists) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'User not found'
            });
        }

        const userData = userDoc.data();

        // Attach user to request
        req.user = {
            id: decodedToken.uid,
            email: decodedToken.email,
            role: userData.role || 'customer',
            ...userData
        };
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired token'
        });
    }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required'
        });
    }

    if (req.user.role !== 'GronderfulBlogs') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Admin access required'
        });
    }

    next();
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decodedToken = await auth.verifyIdToken(token);
            const userDoc = await db.collection('users').doc(decodedToken.uid).get();

            if (userDoc.exists) {
                const userData = userDoc.data();
                req.user = {
                    id: decodedToken.uid,
                    email: decodedToken.email,
                    role: userData.role || 'customer',
                    ...userData
                };
            }
        }
    } catch (error) {
        // Don't fail, just continue without user
        console.log('Optional auth failed:', error.message);
    }

    next();
};

module.exports = {
    authenticateToken,
    authenticateApiKey,
    authenticateTokenOrApiKey,
    requireAdmin,
    optionalAuth
};
