const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');

// ===========================
// GET USER PREFERENCES
// ===========================
router.get('/me/preferences', authenticateToken, async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.id).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'User not found'
            });
        }

        const userData = userDoc.data();

        // Return only preference-related fields
        res.json({
            preferences: {
                // Marketing consents
                emailOptIn: userData.emailOptIn || false,
                smsOptIn: userData.smsOptIn || false,
                trackingOptIn: userData.trackingOptIn || false,
                emailFrequency: userData.emailFrequency || 'weekly',

                // Profile
                birthday: userData.birthday || null,
                location: userData.location || { city: '', country: '' },
                experienceLevel: userData.experienceLevel || null,

                // Interests
                traditions: userData.traditions || [],
                interests: userData.interests || [],
                favoriteProductTypes: userData.favoriteProductTypes || [],

                // Community
                blogSubscription: userData.blogSubscription || false,
                workshopInterest: userData.workshopInterest || false,

                // Progressive profiling
                profileCompletionStep: userData.profileCompletionStep || 0
            }
        });
    } catch (error) {
        console.error('Get preferences error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to fetch preferences'
        });
    }
});

// ===========================
// UPDATE USER PREFERENCES
// ===========================
router.put('/me/preferences',
    authenticateToken,
    [
        body('emailOptIn').optional().isBoolean(),
        body('smsOptIn').optional().isBoolean(),
        body('trackingOptIn').optional().isBoolean(),
        body('emailFrequency').optional({ values: 'null' }).isIn(['weekly', 'monthly', 'important-only']),
        body('birthday').optional({ values: 'null' }),
        body('location').optional({ values: 'null' }),
        body('experienceLevel').optional({ values: 'null' }).custom((value) => {
            if (value === null) return true;
            return ['beginner', 'intermediate', 'advanced'].includes(value);
        }),
        body('traditions').optional({ values: 'null' }).isArray(),
        body('interests').optional({ values: 'null' }).isArray(),
        body('favoriteProductTypes').optional({ values: 'null' }).isArray(),
        body('blogSubscription').optional().isBoolean(),
        body('workshopInterest').optional().isBoolean()
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

            const userId = req.user.id;
            const updates = {};

            // Only update fields that are provided
            const allowedFields = [
                'emailOptIn', 'smsOptIn', 'trackingOptIn', 'emailFrequency',
                'birthday', 'location', 'experienceLevel',
                'traditions', 'interests', 'favoriteProductTypes',
                'blogSubscription', 'workshopInterest'
            ];

            allowedFields.forEach(field => {
                if (req.body[field] !== undefined) {
                    updates[field] = req.body[field];
                }
            });

            // Auto-tag based on preferences
            const newTags = [];

            // Tag based on experience level
            if (updates.experienceLevel) {
                newTags.push(`level:${updates.experienceLevel}`);
            }

            // Tag based on traditions
            if (updates.traditions && updates.traditions.length > 0) {
                updates.traditions.forEach(tradition => {
                    newTags.push(`tradition:${tradition.toLowerCase().replace(/\s+/g, '-')}`);
                });
            }

            // Tag based on interests
            if (updates.interests && updates.interests.length > 0) {
                updates.interests.forEach(interest => {
                    newTags.push(`interest:${interest.toLowerCase().replace(/\s+/g, '-')}`);
                });
            }

            // Tag based on marketing channels
            if (updates.emailOptIn) {
                newTags.push('channel:email_opt_in');
            }
            if (updates.smsOptIn) {
                newTags.push('channel:sms_opt_in');
            }

            // Get existing tags and merge
            const userDoc = await db.collection('users').doc(userId).get();
            const existingTags = userDoc.data().tags || [];
            const mergedTags = [...new Set([...existingTags, ...newTags])];

            updates.tags = mergedTags;
            updates.updatedAt = new Date();

            // Increment profile completion step if needed
            const currentStep = userDoc.data().profileCompletionStep || 0;
            if (currentStep < 4) {
                updates.profileCompletionStep = currentStep + 1;
            }

            await db.collection('users').doc(userId).update(updates);

            res.json({
                message: 'Preferences updated successfully',
                preferences: updates,
                profileCompletionStep: updates.profileCompletionStep
            });
        } catch (error) {
            console.error('Update preferences error:', error);
            res.status(500).json({
                error: 'ServerError',
                message: 'Failed to update preferences'
            });
        }
    }
);

// ===========================
// GET PROFILE PROMPT
// Progressive profiling - returns next field(s) to ask
// ===========================
router.get('/me/profile-prompt', authenticateToken, async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.id).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'User not found'
            });
        }

        const userData = userDoc.data();
        const completionStep = userData.profileCompletionStep || 0;

        // Define progressive profiling steps
        const profilingSteps = [
            {
                step: 0,
                message: 'Help us personalize your experience!',
                fields: [
                    { name: 'experienceLevel', label: 'What is your experience level?', type: 'radio', options: ['beginner', 'intermediate', 'advanced'] }
                ]
            },
            {
                step: 1,
                message: 'Tell us about your interests',
                fields: [
                    { name: 'traditions', label: 'Which traditions resonate with you?', type: 'multi-select', options: ['Witchcraft (Eclectic)', 'Wicca', 'Hermeticism', 'Chaos Magic', 'Hoodoo', 'Folk Magic', 'Tarot', 'Astrology'] },
                    { name: 'interests', label: 'What are you most interested in?', type: 'multi-select', options: ['Altar Supplies', 'Crystals', 'Herbs', 'Incense', 'Spell Kits', 'Books/Grimoire', 'Jewelry', 'Divination tools'] }
                ]
            },
            {
                step: 2,
                message: 'A few more details',
                fields: [
                    { name: 'birthday', label: 'Your birthday (month & day only)', type: 'date', privacy: 'We only store month/day for astrology & birthday promos' },
                    { name: 'location', label: 'Your location (city, country)', type: 'location', privacy: 'For local events & time zone' }
                ]
            },
            {
                step: 3,
                message: 'Stay connected',
                fields: [
                    { name: 'blogSubscription', label: 'Subscribe to our blog?', type: 'boolean' },
                    { name: 'workshopInterest', label: 'Interested in workshops & events?', type: 'boolean' },
                    { name: 'emailFrequency', label: 'How often would you like to hear from us?', type: 'radio', options: ['weekly', 'monthly', 'important-only'] }
                ]
            }
        ];

        if (completionStep >= profilingSteps.length) {
            return res.json({
                completed: true,
                message: 'Profile complete! Thank you.'
            });
        }

        res.json({
            completed: false,
            prompt: profilingSteps[completionStep]
        });
    } catch (error) {
        console.error('Get profile prompt error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to fetch profile prompt'
        });
    }
});

// ===========================
// ADD/REMOVE USER TAGS
// ===========================
router.post('/me/tags',
    authenticateToken,
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

            const { tags, action } = req.body;
            const userId = req.user.id;

            const userDoc = await db.collection('users').doc(userId).get();
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
                tags: existingTags
            });
        } catch (error) {
            console.error('Manage tags error:', error);
            res.status(500).json({
                error: 'ServerError',
                message: 'Failed to manage tags'
            });
        }
    }
);

// ===========================
// TRACK BEHAVIOR (for personalization)
// ===========================
router.post('/me/track',
    authenticateToken,
    [
        body('event').notEmpty(),
        body('data').optional()
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

            const userId = req.user.id;
            const { event, data } = req.body;

            // Check if user has tracking consent
            const userDoc = await db.collection('users').doc(userId).get();
            const userData = userDoc.data();

            if (!userData.trackingOptIn) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Tracking not enabled for this user'
                });
            }

            const updates = { updatedAt: new Date() };

            // Handle different event types
            switch (event) {
                case 'cart_abandoned':
                    updates.cartAbandonedCount = (userData.cartAbandonedCount || 0) + 1;
                    break;

                case 'purchase':
                    updates.lastPurchase = new Date();
                    updates.lifetimeValue = (userData.lifetimeValue || 0) + (data.amount || 0);

                    // Auto-tag based on purchase
                    if (data.productCategory) {
                        const newTag = `interest:${data.productCategory}`;
                        const existingTags = userData.tags || [];
                        if (!existingTags.includes(newTag)) {
                            updates.tags = [...existingTags, newTag];
                        }
                    }
                    break;

                case 'email_opened':
                    updates['emailEngagement.lastOpened'] = new Date();
                    break;

                case 'email_clicked':
                    updates['emailEngagement.clickedOffers'] = true;
                    break;

                default:
                    break;
            }

            if (Object.keys(updates).length > 1) { // More than just updatedAt
                await db.collection('users').doc(userId).update(updates);
            }

            res.json({
                message: 'Event tracked successfully'
            });
        } catch (error) {
            console.error('Track event error:', error);
            res.status(500).json({
                error: 'ServerError',
                message: 'Failed to track event'
            });
        }
    }
);

module.exports = router;
