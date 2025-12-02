const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../config/firebase');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');

// ===========================
// VALIDATE COUPON CODE (Public)
// ===========================
router.post('/validate',
    [
        body('code').trim().notEmpty().withMessage('Coupon code is required'),
        body('orderTotal').isFloat({ min: 0 }).withMessage('Order total must be a positive number'),
        body('userId').optional().isString(),
        body('categoryId').optional().isString(),
        body('productIds').optional().isArray()
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
                code,
                orderTotal,
                userId,
                categoryId,
                productIds = []
            } = req.body;

            // Find coupon by code
            const couponSnapshot = await db.collection('coupons')
                .where('code', '==', code.toUpperCase())
                .where('isActive', '==', true)
                .limit(1)
                .get();

            if (couponSnapshot.empty) {
                return res.status(404).json({
                    success: false,
                    error: 'INVALID_COUPON',
                    message: 'Invalid or expired coupon code'
                });
            }

            const couponDoc = couponSnapshot.docs[0];
            const coupon = couponDoc.data();
            const now = new Date();

            // Check if coupon has started
            if (coupon.startDate && coupon.startDate.toDate() > now) {
                return res.status(400).json({
                    success: false,
                    error: 'COUPON_NOT_STARTED',
                    message: 'This coupon is not yet active'
                });
            }

            // Check if coupon has expired
            if (coupon.expiryDate && coupon.expiryDate.toDate() < now) {
                return res.status(400).json({
                    success: false,
                    error: 'COUPON_EXPIRED',
                    message: 'This coupon has expired'
                });
            }

            // Check usage limit
            if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
                return res.status(400).json({
                    success: false,
                    error: 'COUPON_LIMIT_REACHED',
                    message: 'This coupon has reached its usage limit'
                });
            }

            // Check per-user usage limit
            if (userId && coupon.maxUsesPerUser) {
                const userUsageSnapshot = await db.collection('couponUsage')
                    .where('couponId', '==', couponDoc.id)
                    .where('userId', '==', userId)
                    .get();

                if (userUsageSnapshot.size >= coupon.maxUsesPerUser) {
                    return res.status(400).json({
                        success: false,
                        error: 'USER_LIMIT_REACHED',
                        message: 'You have already used this coupon the maximum number of times'
                    });
                }
            }

            // Check minimum order amount
            if (coupon.minOrderAmount && orderTotal < coupon.minOrderAmount) {
                return res.status(400).json({
                    success: false,
                    error: 'MINIMUM_NOT_MET',
                    message: `Minimum order amount of $${coupon.minOrderAmount} required`,
                    minimumRequired: coupon.minOrderAmount
                });
            }

            // Check category restriction
            if (coupon.applicableCategories && coupon.applicableCategories.length > 0) {
                if (!categoryId || !coupon.applicableCategories.includes(categoryId)) {
                    return res.status(400).json({
                        success: false,
                        error: 'CATEGORY_NOT_APPLICABLE',
                        message: 'This coupon is not applicable to the selected category'
                    });
                }
            }

            // Check product restriction
            if (coupon.applicableProducts && coupon.applicableProducts.length > 0) {
                const hasApplicableProduct = productIds.some(pid =>
                    coupon.applicableProducts.includes(pid)
                );

                if (!hasApplicableProduct) {
                    return res.status(400).json({
                        success: false,
                        error: 'PRODUCT_NOT_APPLICABLE',
                        message: 'This coupon is not applicable to any products in your cart'
                    });
                }
            }

            // Calculate discount
            let discountAmount = 0;
            if (coupon.discountType === 'percentage') {
                discountAmount = (orderTotal * coupon.discountValue) / 100;
                if (coupon.maxDiscountAmount) {
                    discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
                }
            } else if (coupon.discountType === 'fixed') {
                discountAmount = coupon.discountValue;
            } else if (coupon.discountType === 'freeShipping') {
                discountAmount = 0; // Handled separately in checkout
            }

            discountAmount = Math.min(discountAmount, orderTotal);

            res.json({
                success: true,
                valid: true,
                coupon: {
                    id: couponDoc.id,
                    code: coupon.code,
                    discountType: coupon.discountType,
                    discountValue: coupon.discountValue,
                    discountAmount: Math.round(discountAmount * 100) / 100,
                    description: coupon.description,
                    freeShipping: coupon.discountType === 'freeShipping'
                }
            });
        } catch (error) {
            console.error('Validate coupon error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to validate coupon'
            });
        }
    }
);

// ===========================
// APPLY COUPON (Record usage)
// ===========================
router.post('/apply', authenticateToken,
    [
        body('couponId').isString().notEmpty(),
        body('orderId').isString().notEmpty(),
        body('discountAmount').isFloat({ min: 0 })
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

            const { couponId, orderId, discountAmount } = req.body;

            // Record usage
            const usageData = {
                couponId,
                orderId,
                userId: req.user.id,
                userEmail: req.user.email,
                discountAmount,
                appliedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('couponUsage').add(usageData);

            // Increment usage count
            await db.collection('coupons').doc(couponId).update({
                usedCount: admin.firestore.FieldValue.increment(1),
                lastUsedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            res.json({
                success: true,
                message: 'Coupon applied successfully'
            });
        } catch (error) {
            console.error('Apply coupon error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to apply coupon'
            });
        }
    }
);

// ===========================
// GET ALL COUPONS (Admin)
// ===========================
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            status = 'all',
            sort = 'createdAt',
            order = 'desc',
            limit = 50
        } = req.query;

        let query = db.collection('coupons');

        // Filter by status
        if (status === 'active') {
            query = query.where('isActive', '==', true);
        } else if (status === 'inactive') {
            query = query.where('isActive', '==', false);
        }

        // Sort
        const validSortFields = ['createdAt', 'code', 'usedCount', 'expiryDate'];
        const sortField = validSortFields.includes(sort) ? sort : 'createdAt';
        const sortOrder = order === 'asc' ? 'asc' : 'desc';

        query = query.orderBy(sortField, sortOrder).limit(parseInt(limit));

        const snapshot = await query.get();
        const coupons = [];

        snapshot.docs.forEach(doc => {
            coupons.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.json({
            success: true,
            coupons,
            count: coupons.length
        });
    } catch (error) {
        console.error('Get coupons error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch coupons'
        });
    }
});

// ===========================
// GET SINGLE COUPON (Admin)
// ===========================
router.get('/admin/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const couponDoc = await db.collection('coupons').doc(id).get();

        if (!couponDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Coupon not found'
            });
        }

        // Get usage statistics
        const usageSnapshot = await db.collection('couponUsage')
            .where('couponId', '==', id)
            .get();

        const couponData = {
            id: couponDoc.id,
            ...couponDoc.data(),
            usageCount: usageSnapshot.size
        };

        res.json({
            success: true,
            coupon: couponData
        });
    } catch (error) {
        console.error('Get coupon error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch coupon'
        });
    }
});

// ===========================
// CREATE COUPON (Admin)
// ===========================
router.post('/admin', authenticateToken, requireAdmin,
    [
        body('code').trim().notEmpty().matches(/^[A-Z0-9-_]+$/).withMessage('Code must be uppercase alphanumeric with hyphens/underscores'),
        body('description').trim().notEmpty(),
        body('discountType').isIn(['percentage', 'fixed', 'freeShipping']),
        body('discountValue').isFloat({ min: 0 }),
        body('minOrderAmount').optional().isFloat({ min: 0 }),
        body('maxDiscountAmount').optional().isFloat({ min: 0 }),
        body('maxUses').optional().isInt({ min: 1 }),
        body('maxUsesPerUser').optional().isInt({ min: 1 }),
        body('startDate').optional().isISO8601(),
        body('expiryDate').optional().isISO8601(),
        body('applicableCategories').optional().isArray(),
        body('applicableProducts').optional().isArray()
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
                code,
                description,
                discountType,
                discountValue,
                minOrderAmount = 0,
                maxDiscountAmount = null,
                maxUses = null,
                maxUsesPerUser = null,
                startDate = null,
                expiryDate = null,
                applicableCategories = [],
                applicableProducts = [],
                isActive = true
            } = req.body;

            // Validate discount value based on type
            if (discountType === 'percentage' && discountValue > 100) {
                return res.status(400).json({
                    success: false,
                    error: 'VALIDATION_ERROR',
                    message: 'Percentage discount cannot exceed 100%'
                });
            }

            // Check if code already exists
            const existingCoupon = await db.collection('coupons')
                .where('code', '==', code.toUpperCase())
                .limit(1)
                .get();

            if (!existingCoupon.empty) {
                return res.status(409).json({
                    success: false,
                    error: 'CONFLICT',
                    message: 'Coupon code already exists'
                });
            }

            // Create coupon
            const couponData = {
                code: code.toUpperCase(),
                description,
                discountType,
                discountValue,
                minOrderAmount,
                maxDiscountAmount,
                maxUses,
                maxUsesPerUser,
                startDate: startDate ? admin.firestore.Timestamp.fromDate(new Date(startDate)) : null,
                expiryDate: expiryDate ? admin.firestore.Timestamp.fromDate(new Date(expiryDate)) : null,
                applicableCategories,
                applicableProducts,
                isActive,
                usedCount: 0,
                createdBy: req.user.email,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('coupons').add(couponData);

            res.status(201).json({
                success: true,
                message: 'Coupon created successfully',
                coupon: {
                    id: docRef.id,
                    ...couponData
                }
            });
        } catch (error) {
            console.error('Create coupon error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to create coupon'
            });
        }
    }
);

// ===========================
// UPDATE COUPON (Admin)
// ===========================
router.put('/admin/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const couponRef = db.collection('coupons').doc(id);
        const couponDoc = await couponRef.get();

        if (!couponDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Coupon not found'
            });
        }

        const allowedFields = [
            'description', 'discountType', 'discountValue', 'minOrderAmount',
            'maxDiscountAmount', 'maxUses', 'maxUsesPerUser', 'startDate',
            'expiryDate', 'applicableCategories', 'applicableProducts', 'isActive'
        ];

        const updates = {};
        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                if (key === 'startDate' || key === 'expiryDate') {
                    updates[key] = req.body[key]
                        ? admin.firestore.Timestamp.fromDate(new Date(req.body[key]))
                        : null;
                } else {
                    updates[key] = req.body[key];
                }
            }
        });

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'No valid fields to update'
            });
        }

        // Validate discount value
        if (updates.discountType === 'percentage' && updates.discountValue > 100) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Percentage discount cannot exceed 100%'
            });
        }

        updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        updates.updatedBy = req.user.email;

        await couponRef.update(updates);

        const updated = await couponRef.get();

        res.json({
            success: true,
            message: 'Coupon updated successfully',
            coupon: {
                id: updated.id,
                ...updated.data()
            }
        });
    } catch (error) {
        console.error('Update coupon error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to update coupon'
        });
    }
});

// ===========================
// DELETE COUPON (Admin)
// ===========================
router.delete('/admin/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { permanent = 'false' } = req.query;

        const couponRef = db.collection('coupons').doc(id);
        const couponDoc = await couponRef.get();

        if (!couponDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Coupon not found'
            });
        }

        if (permanent === 'true') {
            // Permanent delete
            await couponRef.delete();

            res.json({
                success: true,
                message: 'Coupon permanently deleted'
            });
        } else {
            // Soft delete
            await couponRef.update({
                isActive: false,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                deactivatedBy: req.user.email
            });

            res.json({
                success: true,
                message: 'Coupon deactivated successfully'
            });
        }
    } catch (error) {
        console.error('Delete coupon error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to delete coupon'
        });
    }
});

// ===========================
// GET COUPON ANALYTICS (Admin)
// ===========================
router.get('/admin/analytics/overview', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Get all coupons
        const couponsSnapshot = await db.collection('coupons').get();

        let usageQuery = db.collection('couponUsage');

        if (startDate) {
            usageQuery = usageQuery.where('appliedAt', '>=', new Date(startDate));
        }
        if (endDate) {
            usageQuery = usageQuery.where('appliedAt', '<=', new Date(endDate));
        }

        const usageSnapshot = await usageQuery.get();

        // Calculate analytics
        let totalCoupons = couponsSnapshot.size;
        let activeCoupons = 0;
        let totalUsage = usageSnapshot.size;
        let totalDiscountGiven = 0;

        couponsSnapshot.docs.forEach(doc => {
            const coupon = doc.data();
            if (coupon.isActive) activeCoupons++;
        });

        usageSnapshot.docs.forEach(doc => {
            totalDiscountGiven += doc.data().discountAmount || 0;
        });

        // Top performing coupons
        const couponUsageMap = {};
        usageSnapshot.docs.forEach(doc => {
            const usage = doc.data();
            if (!couponUsageMap[usage.couponId]) {
                couponUsageMap[usage.couponId] = {
                    count: 0,
                    totalDiscount: 0
                };
            }
            couponUsageMap[usage.couponId].count++;
            couponUsageMap[usage.couponId].totalDiscount += usage.discountAmount || 0;
        });

        // Get coupon details for top performers
        const topCoupons = Object.entries(couponUsageMap)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10);

        const topCouponsData = [];
        for (const [couponId, stats] of topCoupons) {
            const couponDoc = await db.collection('coupons').doc(couponId).get();
            if (couponDoc.exists) {
                topCouponsData.push({
                    id: couponId,
                    code: couponDoc.data().code,
                    usageCount: stats.count,
                    totalDiscount: Math.round(stats.totalDiscount * 100) / 100
                });
            }
        }

        res.json({
            success: true,
            analytics: {
                totalCoupons,
                activeCoupons,
                inactiveCoupons: totalCoupons - activeCoupons,
                totalUsage,
                totalDiscountGiven: Math.round(totalDiscountGiven * 100) / 100,
                averageDiscountPerUse: totalUsage > 0
                    ? Math.round((totalDiscountGiven / totalUsage) * 100) / 100
                    : 0,
                topPerformingCoupons: topCouponsData
            }
        });
    } catch (error) {
        console.error('Get coupon analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch coupon analytics'
        });
    }
});

// ===========================
// GET COUPON USAGE HISTORY (Admin)
// ===========================
router.get('/admin/:id/usage', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        const usageSnapshot = await db.collection('couponUsage')
            .where('couponId', '==', id)
            .orderBy('appliedAt', 'desc')
            .limit(parseInt(limit))
            .offset(parseInt(offset))
            .get();

        const usageHistory = [];
        usageSnapshot.docs.forEach(doc => {
            usageHistory.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.json({
            success: true,
            usage: usageHistory,
            count: usageHistory.length
        });
    } catch (error) {
        console.error('Get usage history error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch usage history'
        });
    }
});

module.exports = router;
