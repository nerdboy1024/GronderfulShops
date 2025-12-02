const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const { db } = require('../config/firebase');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { requireRole, requirePermission } = require('../middleware/rbac');

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// Helper function to serialize Firestore Timestamps
const serializeTimestamp = (timestamp) => {
    if (!timestamp) return null;
    if (timestamp.toDate) return timestamp.toDate().toISOString();
    return timestamp;
};

// Helper function to serialize user data with Firestore Timestamps
const serializeUserData = (userData) => {
    const serialized = { ...userData };

    // Serialize timestamp fields
    if (serialized.lastLogin) serialized.lastLogin = serializeTimestamp(serialized.lastLogin);
    if (serialized.createdAt) serialized.createdAt = serializeTimestamp(serialized.createdAt);
    if (serialized.updatedAt) serialized.updatedAt = serializeTimestamp(serialized.updatedAt);
    if (serialized.lastPurchase) serialized.lastPurchase = serializeTimestamp(serialized.lastPurchase);

    // Serialize email engagement timestamps
    if (serialized.emailEngagement?.lastOpened) {
        serialized.emailEngagement.lastOpened = serializeTimestamp(serialized.emailEngagement.lastOpened);
    }
    if (serialized.emailEngagement?.lastClicked) {
        serialized.emailEngagement.lastClicked = serializeTimestamp(serialized.emailEngagement.lastClicked);
    }

    return serialized;
};

// ===========================
// GET ALL USERS
// ===========================
router.get('/users',
    [
        query('role').optional().isIn(['GronderfulBlogs', 'customer', 'contributor', 'affiliate']),
        query('tag').optional(),
        query('emailOptIn').optional().isBoolean(),
        query('search').optional(),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: 'Invalid query parameters',
                    errors: errors.array()
                });
            }

            const { role, tag, emailOptIn, search, limit = 50, offset = 0 } = req.query;

            let query = db.collection('users');

            // Apply filters
            if (role) {
                query = query.where('role', '==', role);
            }
            if (tag) {
                query = query.where('tags', 'array-contains', tag);
            }
            if (emailOptIn !== undefined) {
                query = query.where('emailOptIn', '==', emailOptIn === 'true');
            }

            // Get users
            const snapshot = await query.get();
            let users = [];

            snapshot.forEach(doc => {
                const userData = doc.data();
                users.push({
                    id: doc.id,
                    email: userData.email,
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    displayName: userData.displayName,
                    role: userData.role,
                    tags: userData.tags || [],
                    lifetimeValue: userData.lifetimeValue || 0,
                    lastLogin: serializeTimestamp(userData.lastLogin),
                    emailOptIn: userData.emailOptIn,
                    smsOptIn: userData.smsOptIn,
                    createdAt: serializeTimestamp(userData.createdAt)
                });
            });

            // Apply search filter (client-side for now)
            if (search) {
                const searchLower = search.toLowerCase();
                users = users.filter(user =>
                    user.email.toLowerCase().includes(searchLower) ||
                    user.displayName.toLowerCase().includes(searchLower) ||
                    (user.firstName && user.firstName.toLowerCase().includes(searchLower)) ||
                    (user.lastName && user.lastName.toLowerCase().includes(searchLower))
                );
            }

            // Sort by created date (newest first)
            users.sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
                const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
                return dateB - dateA;
            });

            // Apply pagination
            const total = users.length;
            const paginatedUsers = users.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

            res.json({
                users: paginatedUsers,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: (parseInt(offset) + parseInt(limit)) < total
                }
            });
        } catch (error) {
            console.error('Get users error:', error);
            res.status(500).json({
                error: 'ServerError',
                message: 'Failed to fetch users'
            });
        }
    }
);

// ===========================
// GET USER BY ID
// ===========================
router.get('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const userDoc = await db.collection('users').doc(userId).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'User not found'
            });
        }

        const userData = userDoc.data();

        // Return full user data (excluding password hash)
        const { passwordHash, ...userDataWithoutPassword } = userData;

        // Serialize timestamps
        const serializedUser = serializeUserData(userDataWithoutPassword);

        res.json({
            user: {
                id: userDoc.id,
                ...serializedUser
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to fetch user'
        });
    }
});

// ===========================
// UPDATE USER ROLE
// ===========================
router.put('/users/:id/role',
    [
        body('role').isIn(['GronderfulBlogs', 'customer', 'contributor', 'affiliate'])
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

            const userId = req.params.id;
            const { role } = req.body;

            // Prevent admin from changing their own role
            if (userId === req.user.id) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'You cannot change your own role'
                });
            }

            const userDoc = await db.collection('users').doc(userId).get();

            if (!userDoc.exists) {
                return res.status(404).json({
                    error: 'NotFound',
                    message: 'User not found'
                });
            }

            await db.collection('users').doc(userId).update({
                role,
                updatedAt: new Date()
            });

            res.json({
                message: 'User role updated successfully',
                userId,
                newRole: role
            });
        } catch (error) {
            console.error('Update user role error:', error);
            res.status(500).json({
                error: 'ServerError',
                message: 'Failed to update user role'
            });
        }
    }
);

// ===========================
// ADD/REMOVE TAGS (Admin)
// ===========================
router.post('/users/:id/tags',
    [
        body('tags').isArray(),
        body('action').isIn(['add', 'remove'])
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

            const userId = req.params.id;
            const { tags, action } = req.body;

            const userDoc = await db.collection('users').doc(userId).get();

            if (!userDoc.exists) {
                return res.status(404).json({
                    error: 'NotFound',
                    message: 'User not found'
                });
            }

            let existingTags = userDoc.data().tags || [];

            if (action === 'add') {
                existingTags = [...new Set([...existingTags, ...tags])];
            } else if (action === 'remove') {
                existingTags = existingTags.filter(tag => !tags.includes(tag));
            }

            await db.collection('users').doc(userId).update({
                tags: existingTags,
                updatedAt: new Date()
            });

            res.json({
                message: `Tags ${action}ed successfully`,
                userId,
                tags: existingTags
            });
        } catch (error) {
            console.error('Manage user tags error:', error);
            res.status(500).json({
                error: 'ServerError',
                message: 'Failed to manage user tags'
            });
        }
    }
);

// ===========================
// GET USER SEGMENTS
// ===========================
router.get('/segments', async (req, res) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        const users = [];

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            users.push({
                id: doc.id,
                ...userData
            });
        });

        // Define segments
        const segments = {
            beginnerTarotBuyers: {
                name: 'Beginner Tarot Buyers',
                description: 'Users interested in tarot with beginner experience level',
                users: users.filter(u =>
                    u.tags?.includes('interest:tarot') &&
                    u.tags?.includes('level:beginner')
                )
            },
            crystalEnthusiasts: {
                name: 'Crystal Enthusiasts (Intermediate+)',
                description: 'Intermediate/advanced users interested in crystals',
                users: users.filter(u =>
                    u.tags?.includes('interest:crystals') &&
                    (u.tags?.includes('level:intermediate') || u.tags?.includes('level:advanced'))
                )
            },
            emailEngaged: {
                name: 'Email Engaged Users',
                description: 'Users who opened emails in the last 30 days',
                users: users.filter(u => {
                    if (!u.emailEngagement?.lastOpened) return false;
                    const lastOpened = u.emailEngagement.lastOpened.toDate ?
                        u.emailEngagement.lastOpened.toDate() :
                        new Date(u.emailEngagement.lastOpened);
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    return lastOpened > thirtyDaysAgo;
                })
            },
            cartAbandoners: {
                name: 'Cart Abandoners',
                description: 'Users who abandoned cart 2+ times',
                users: users.filter(u => (u.cartAbandonedCount || 0) >= 2)
            },
            highLTV: {
                name: 'High Lifetime Value',
                description: 'Users with lifetime value > $100',
                users: users.filter(u => (u.lifetimeValue || 0) > 100)
            },
            emailOptedIn: {
                name: 'Email Opted In',
                description: 'Users who opted into email marketing',
                users: users.filter(u => u.emailOptIn === true)
            },
            smsOptedIn: {
                name: 'SMS Opted In',
                description: 'Users who opted into SMS marketing',
                users: users.filter(u => u.smsOptIn === true)
            },
            hoodooInterest: {
                name: 'Hoodoo/Folk Magic Interest',
                description: 'Users interested in Hoodoo or folk magic traditions',
                users: users.filter(u =>
                    u.tags?.includes('tradition:hoodoo') ||
                    u.tags?.includes('tradition:folk-magic')
                )
            },
            newUsers: {
                name: 'New Users (Last 7 Days)',
                description: 'Users who signed up in the last 7 days',
                users: users.filter(u => {
                    if (!u.createdAt) return false;
                    const created = u.createdAt.toDate ?
                        u.createdAt.toDate() :
                        new Date(u.createdAt);
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    return created > sevenDaysAgo;
                })
            }
        };

        // Return segment stats
        const segmentStats = {};
        Object.keys(segments).forEach(key => {
            segmentStats[key] = {
                name: segments[key].name,
                description: segments[key].description,
                count: segments[key].users.length,
                users: segments[key].users.map(u => ({
                    id: u.id,
                    email: u.email,
                    displayName: u.displayName,
                    lifetimeValue: u.lifetimeValue || 0,
                    tags: u.tags || []
                }))
            };
        });

        res.json({
            segments: segmentStats,
            totalUsers: users.length
        });
    } catch (error) {
        console.error('Get segments error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to fetch user segments'
        });
    }
});

// ===========================
// EXPORT SEGMENT EMAILS
// ===========================
router.get('/segments/:segmentKey/export', async (req, res) => {
    try {
        const { segmentKey } = req.params;

        // Re-query to get fresh segment data
        const usersSnapshot = await db.collection('users').get();
        const users = [];

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            users.push({
                id: doc.id,
                ...userData
            });
        });

        // Apply segment filter (simplified - should match /segments logic)
        let filteredUsers = [];

        switch (segmentKey) {
            case 'beginnerTarotBuyers':
                filteredUsers = users.filter(u =>
                    u.tags?.includes('interest:tarot') && u.tags?.includes('level:beginner')
                );
                break;
            case 'crystalEnthusiasts':
                filteredUsers = users.filter(u =>
                    u.tags?.includes('interest:crystals') &&
                    (u.tags?.includes('level:intermediate') || u.tags?.includes('level:advanced'))
                );
                break;
            case 'emailOptedIn':
                filteredUsers = users.filter(u => u.emailOptIn === true);
                break;
            case 'smsOptedIn':
                filteredUsers = users.filter(u => u.smsOptIn === true);
                break;
            case 'highLTV':
                filteredUsers = users.filter(u => (u.lifetimeValue || 0) > 100);
                break;
            default:
                return res.status(404).json({
                    error: 'NotFound',
                    message: 'Segment not found'
                });
        }

        // Export email list as CSV
        const emails = filteredUsers.map(u => u.email).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${segmentKey}_emails.csv"`);
        res.send(`Email\n${emails}`);
    } catch (error) {
        console.error('Export segment error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to export segment'
        });
    }
});

// ===========================
// GET ADMIN STATS
// ===========================
router.get('/stats', async (req, res) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        const users = [];

        usersSnapshot.forEach(doc => {
            users.push(doc.data());
        });

        const stats = {
            totalUsers: users.length,
            usersByRole: {
                admin: users.filter(u => u.role === 'GronderfulBlogs').length,
                customer: users.filter(u => u.role === 'customer').length,
                contributor: users.filter(u => u.role === 'contributor').length,
                affiliate: users.filter(u => u.role === 'affiliate').length
            },
            marketingStats: {
                emailOptIn: users.filter(u => u.emailOptIn === true).length,
                smsOptIn: users.filter(u => u.smsOptIn === true).length,
                trackingOptIn: users.filter(u => u.trackingOptIn === true).length
            },
            experienceLevels: {
                beginner: users.filter(u => u.experienceLevel === 'beginner').length,
                intermediate: users.filter(u => u.experienceLevel === 'intermediate').length,
                advanced: users.filter(u => u.experienceLevel === 'advanced').length,
                notSet: users.filter(u => !u.experienceLevel).length
            },
            totalLifetimeValue: users.reduce((sum, u) => sum + (u.lifetimeValue || 0), 0)
        };

        res.json({ stats });
    } catch (error) {
        console.error('Get admin stats error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to fetch admin stats'
        });
    }
});

module.exports = router;
