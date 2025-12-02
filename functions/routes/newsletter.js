const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../config/firebase');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');
const crypto = require('crypto');

// ===========================
// SUBSCRIBE TO NEWSLETTER (Public)
// ===========================
router.post('/subscribe',
    [
        body('email').isEmail().normalizeEmail(),
        body('firstName').optional().trim(),
        body('lastName').optional().trim(),
        body('preferences').optional().isObject()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: 'VALIDATION_ERROR',
                    message: 'Invalid email address',
                    errors: errors.array()
                });
            }

            const {
                email,
                firstName = '',
                lastName = '',
                preferences = {
                    productUpdates: true,
                    blogPosts: true,
                    specialOffers: true,
                    weeklyDigest: false
                }
            } = req.body;

            // Check if already subscribed
            const existingSnapshot = await db.collection('newsletter')
                .where('email', '==', email)
                .limit(1)
                .get();

            if (!existingSnapshot.empty) {
                const existing = existingSnapshot.docs[0].data();

                if (existing.isActive) {
                    return res.status(409).json({
                        success: false,
                        error: 'ALREADY_SUBSCRIBED',
                        message: 'This email is already subscribed'
                    });
                } else {
                    // Reactivate subscription
                    await existingSnapshot.docs[0].ref.update({
                        isActive: true,
                        firstName,
                        lastName,
                        preferences,
                        resubscribedAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    return res.json({
                        success: true,
                        message: 'Successfully resubscribed to newsletter'
                    });
                }
            }

            // Generate verification and unsubscribe tokens
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const unsubscribeToken = crypto.randomBytes(32).toString('hex');

            // Create subscription
            const subscriptionData = {
                email,
                firstName,
                lastName,
                preferences,
                isActive: true,
                isVerified: false, // Requires email verification
                verificationToken,
                unsubscribeToken,
                source: req.body.source || 'website',
                ipAddress: req.ip,
                subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('newsletter').add(subscriptionData);

            // TODO: Send verification email
            // You would integrate with an email service here (SendGrid, Mailgun, etc.)
            // For now, we'll just return success

            res.status(201).json({
                success: true,
                message: 'Successfully subscribed! Please check your email to verify your subscription.',
                subscriberId: docRef.id,
                verificationRequired: true
            });
        } catch (error) {
            console.error('Subscribe error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to subscribe to newsletter'
            });
        }
    }
);

// ===========================
// VERIFY EMAIL
// ===========================
router.get('/verify/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const snapshot = await db.collection('newsletter')
            .where('verificationToken', '==', token)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({
                success: false,
                error: 'INVALID_TOKEN',
                message: 'Invalid verification token'
            });
        }

        const doc = snapshot.docs[0];
        const subscriber = doc.data();

        if (subscriber.isVerified) {
            return res.json({
                success: true,
                message: 'Email already verified',
                alreadyVerified: true
            });
        }

        await doc.ref.update({
            isVerified: true,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            success: true,
            message: 'Email verified successfully! You are now subscribed to our newsletter.'
        });
    } catch (error) {
        console.error('Verify email error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to verify email'
        });
    }
});

// ===========================
// UNSUBSCRIBE (Public)
// ===========================
router.post('/unsubscribe',
    [
        body('email').optional().isEmail().normalizeEmail(),
        body('token').optional().isString()
    ],
    async (req, res) => {
        try {
            const { email, token } = req.body;

            if (!email && !token) {
                return res.status(400).json({
                    success: false,
                    error: 'VALIDATION_ERROR',
                    message: 'Either email or unsubscribe token is required'
                });
            }

            let query = db.collection('newsletter');

            if (token) {
                query = query.where('unsubscribeToken', '==', token);
            } else if (email) {
                query = query.where('email', '==', email);
            }

            const snapshot = await query.limit(1).get();

            if (snapshot.empty) {
                return res.status(404).json({
                    success: false,
                    error: 'NOT_FOUND',
                    message: 'Subscription not found'
                });
            }

            const doc = snapshot.docs[0];

            await doc.ref.update({
                isActive: false,
                unsubscribedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            res.json({
                success: true,
                message: 'Successfully unsubscribed from newsletter'
            });
        } catch (error) {
            console.error('Unsubscribe error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to unsubscribe'
            });
        }
    }
);

// ===========================
// UNSUBSCRIBE VIA TOKEN (GET for email links)
// ===========================
router.get('/unsubscribe/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const snapshot = await db.collection('newsletter')
            .where('unsubscribeToken', '==', token)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({
                success: false,
                error: 'INVALID_TOKEN',
                message: 'Invalid unsubscribe token'
            });
        }

        const doc = snapshot.docs[0];

        await doc.ref.update({
            isActive: false,
            unsubscribedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            success: true,
            message: 'Successfully unsubscribed from newsletter'
        });
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to unsubscribe'
        });
    }
});

// ===========================
// UPDATE PREFERENCES
// ===========================
router.put('/preferences', optionalAuth,
    [
        body('email').optional().isEmail().normalizeEmail(),
        body('token').optional().isString(),
        body('preferences').isObject()
    ],
    async (req, res) => {
        try {
            const { email, token, preferences } = req.body;

            if (!email && !token && !req.user) {
                return res.status(400).json({
                    success: false,
                    error: 'VALIDATION_ERROR',
                    message: 'Email, token, or authentication required'
                });
            }

            let query = db.collection('newsletter');

            if (token) {
                query = query.where('unsubscribeToken', '==', token);
            } else if (email) {
                query = query.where('email', '==', email);
            } else if (req.user) {
                query = query.where('email', '==', req.user.email);
            }

            const snapshot = await query.limit(1).get();

            if (snapshot.empty) {
                return res.status(404).json({
                    success: false,
                    error: 'NOT_FOUND',
                    message: 'Subscription not found'
                });
            }

            const doc = snapshot.docs[0];

            await doc.ref.update({
                preferences,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            res.json({
                success: true,
                message: 'Preferences updated successfully'
            });
        } catch (error) {
            console.error('Update preferences error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to update preferences'
            });
        }
    }
);

// ===========================
// ADMIN: GET ALL SUBSCRIBERS
// ===========================
router.get('/admin/subscribers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            status = 'active',
            verified,
            limit = 100,
            offset = 0,
            search = ''
        } = req.query;

        let query = db.collection('newsletter');

        // Filter by status
        if (status === 'active') {
            query = query.where('isActive', '==', true);
        } else if (status === 'inactive') {
            query = query.where('isActive', '==', false);
        }

        // Filter by verification status
        if (verified !== undefined) {
            query = query.where('isVerified', '==', verified === 'true');
        }

        const snapshot = await query
            .orderBy('subscribedAt', 'desc')
            .limit(parseInt(limit))
            .offset(parseInt(offset))
            .get();

        let subscribers = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Apply search filter (client-side for now)
        if (search) {
            const searchLower = search.toLowerCase();
            subscribers = subscribers.filter(sub =>
                sub.email.toLowerCase().includes(searchLower) ||
                sub.firstName?.toLowerCase().includes(searchLower) ||
                sub.lastName?.toLowerCase().includes(searchLower)
            );
        }

        // Remove sensitive tokens from response
        subscribers = subscribers.map(sub => {
            const { verificationToken, unsubscribeToken, ...safe } = sub;
            return safe;
        });

        res.json({
            success: true,
            subscribers,
            count: subscribers.length
        });
    } catch (error) {
        console.error('Get subscribers error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch subscribers'
        });
    }
});

// ===========================
// ADMIN: GET SUBSCRIBER STATS
// ===========================
router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const allSnapshot = await db.collection('newsletter').get();

        let totalSubscribers = 0;
        let activeSubscribers = 0;
        let verifiedSubscribers = 0;
        let unverifiedSubscribers = 0;
        let unsubscribedCount = 0;
        const sources = {};
        const preferences = {
            productUpdates: 0,
            blogPosts: 0,
            specialOffers: 0,
            weeklyDigest: 0
        };

        allSnapshot.docs.forEach(doc => {
            const sub = doc.data();
            totalSubscribers++;

            if (sub.isActive) {
                activeSubscribers++;
                if (sub.isVerified) {
                    verifiedSubscribers++;
                } else {
                    unverifiedSubscribers++;
                }

                // Track preferences
                if (sub.preferences) {
                    Object.keys(preferences).forEach(key => {
                        if (sub.preferences[key]) {
                            preferences[key]++;
                        }
                    });
                }
            } else {
                unsubscribedCount++;
            }

            // Track sources
            const source = sub.source || 'unknown';
            sources[source] = (sources[source] || 0) + 1;
        });

        res.json({
            success: true,
            stats: {
                totalSubscribers,
                activeSubscribers,
                verifiedSubscribers,
                unverifiedSubscribers,
                unsubscribedCount,
                verificationRate: totalSubscribers > 0
                    ? Math.round((verifiedSubscribers / totalSubscribers) * 100)
                    : 0,
                sources,
                preferences
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch stats'
        });
    }
});

// ===========================
// ADMIN: CREATE CAMPAIGN
// ===========================
router.post('/admin/campaigns', authenticateToken, requireAdmin,
    [
        body('name').trim().notEmpty(),
        body('subject').trim().notEmpty(),
        body('content').trim().notEmpty(),
        body('targetPreference').optional().isString(),
        body('scheduledFor').optional().isISO8601()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: 'VALIDATION_ERROR',
                    message: 'Invalid input',
                    errors: errors.array()
                });
            }

            const {
                name,
                subject,
                content,
                targetPreference = null,
                scheduledFor = null
            } = req.body;

            const campaignData = {
                name,
                subject,
                content,
                targetPreference,
                scheduledFor: scheduledFor
                    ? admin.firestore.Timestamp.fromDate(new Date(scheduledFor))
                    : null,
                status: scheduledFor ? 'scheduled' : 'draft',
                sentCount: 0,
                openCount: 0,
                clickCount: 0,
                createdBy: req.user.email,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('newsletterCampaigns').add(campaignData);

            res.status(201).json({
                success: true,
                message: 'Campaign created successfully',
                campaign: {
                    id: docRef.id,
                    ...campaignData
                }
            });
        } catch (error) {
            console.error('Create campaign error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to create campaign'
            });
        }
    }
);

// ===========================
// ADMIN: GET CAMPAIGNS
// ===========================
router.get('/admin/campaigns', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;

        let query = db.collection('newsletterCampaigns');

        if (status) {
            query = query.where('status', '==', status);
        }

        const snapshot = await query
            .orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .get();

        const campaigns = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json({
            success: true,
            campaigns,
            count: campaigns.length
        });
    } catch (error) {
        console.error('Get campaigns error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch campaigns'
        });
    }
});

// ===========================
// ADMIN: SEND CAMPAIGN
// ===========================
router.post('/admin/campaigns/:id/send', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const campaignDoc = await db.collection('newsletterCampaigns').doc(id).get();

        if (!campaignDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Campaign not found'
            });
        }

        const campaign = campaignDoc.data();

        // Get target subscribers
        let query = db.collection('newsletter')
            .where('isActive', '==', true)
            .where('isVerified', '==', true);

        if (campaign.targetPreference) {
            query = query.where(`preferences.${campaign.targetPreference}`, '==', true);
        }

        const subscribersSnapshot = await query.get();

        // TODO: Integrate with email service (SendGrid, Mailgun, etc.)
        // For now, we'll just mark as sent and track the count

        await campaignDoc.ref.update({
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            sentCount: subscribersSnapshot.size,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            success: true,
            message: 'Campaign sent successfully',
            recipientCount: subscribersSnapshot.size
        });
    } catch (error) {
        console.error('Send campaign error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to send campaign'
        });
    }
});

// ===========================
// ADMIN: DELETE SUBSCRIBER
// ===========================
router.delete('/admin/subscribers/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const subscriberRef = db.collection('newsletter').doc(id);
        const subscriberDoc = await subscriberRef.get();

        if (!subscriberDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Subscriber not found'
            });
        }

        await subscriberRef.delete();

        res.json({
            success: true,
            message: 'Subscriber deleted successfully'
        });
    } catch (error) {
        console.error('Delete subscriber error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to delete subscriber'
        });
    }
});

// ===========================
// ADMIN: EXPORT SUBSCRIBERS
// ===========================
router.get('/admin/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status = 'active' } = req.query;

        let query = db.collection('newsletter');

        if (status === 'active') {
            query = query.where('isActive', '==', true);
        } else if (status === 'inactive') {
            query = query.where('isActive', '==', false);
        }

        const snapshot = await query.get();

        const subscribers = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                email: data.email,
                firstName: data.firstName || '',
                lastName: data.lastName || '',
                isVerified: data.isVerified,
                subscribedAt: data.subscribedAt?.toDate().toISOString() || '',
                preferences: JSON.stringify(data.preferences || {})
            };
        });

        res.json({
            success: true,
            subscribers,
            count: subscribers.length
        });
    } catch (error) {
        console.error('Export subscribers error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to export subscribers'
        });
    }
});

module.exports = router;
