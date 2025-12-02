const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../config/firebase');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');

// ===========================
// GET PRODUCT REVIEWS (Public)
// ===========================
router.get('/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const {
            limit = 20,
            offset = 0,
            sort = 'newest',
            rating
        } = req.query;

        let query = db.collection('reviews')
            .where('productId', '==', productId)
            .where('isApproved', '==', true);

        // Filter by rating
        if (rating) {
            query = query.where('rating', '==', parseInt(rating));
        }

        // Sort
        if (sort === 'newest') {
            query = query.orderBy('createdAt', 'desc');
        } else if (sort === 'oldest') {
            query = query.orderBy('createdAt', 'asc');
        } else if (sort === 'highest') {
            query = query.orderBy('rating', 'desc');
        } else if (sort === 'lowest') {
            query = query.orderBy('rating', 'asc');
        } else if (sort === 'helpful') {
            query = query.orderBy('helpfulCount', 'desc');
        }

        const snapshot = await query.get();
        const reviews = [];

        snapshot.docs.forEach(doc => {
            reviews.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Pagination
        const startIndex = parseInt(offset);
        const endIndex = startIndex + parseInt(limit);
        const paginatedReviews = reviews.slice(startIndex, endIndex);

        res.json({
            success: true,
            reviews: paginatedReviews,
            total: reviews.length,
            hasMore: endIndex < reviews.length
        });
    } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch reviews'
        });
    }
});

// ===========================
// GET REVIEW STATISTICS
// ===========================
router.get('/product/:productId/stats', async (req, res) => {
    try {
        const { productId } = req.params;

        const snapshot = await db.collection('reviews')
            .where('productId', '==', productId)
            .where('isApproved', '==', true)
            .get();

        let totalRating = 0;
        const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let totalReviews = 0;
        let verifiedPurchaseCount = 0;
        let withPhotosCount = 0;

        snapshot.docs.forEach(doc => {
            const review = doc.data();
            totalRating += review.rating;
            ratingCounts[review.rating] += 1;
            totalReviews += 1;

            if (review.verifiedPurchase) verifiedPurchaseCount += 1;
            if (review.photos && review.photos.length > 0) withPhotosCount += 1;
        });

        const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;

        // Calculate percentages
        const ratingPercentages = {};
        Object.keys(ratingCounts).forEach(rating => {
            ratingPercentages[rating] = totalReviews > 0
                ? Math.round((ratingCounts[rating] / totalReviews) * 100)
                : 0;
        });

        res.json({
            success: true,
            stats: {
                averageRating: Math.round(averageRating * 10) / 10,
                totalReviews,
                ratingCounts,
                ratingPercentages,
                verifiedPurchaseCount,
                withPhotosCount,
                recommendationRate: totalReviews > 0
                    ? Math.round((ratingCounts[4] + ratingCounts[5]) / totalReviews * 100)
                    : 0
            }
        });
    } catch (error) {
        console.error('Get review stats error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch review statistics'
        });
    }
});

// ===========================
// CREATE REVIEW
// ===========================
router.post('/', authenticateToken,
    [
        body('productId').isString().notEmpty(),
        body('rating').isInt({ min: 1, max: 5 }),
        body('title').trim().notEmpty().isLength({ max: 100 }),
        body('comment').trim().notEmpty().isLength({ max: 2000 }),
        body('photos').optional().isArray(),
        body('photos.*').optional().isURL()
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
                productId,
                rating,
                title,
                comment,
                photos = []
            } = req.body;

            // Check if product exists
            const productDoc = await db.collection('products').doc(productId).get();
            if (!productDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'PRODUCT_NOT_FOUND',
                    message: 'Product not found'
                });
            }

            // Check if user already reviewed this product
            const existingReview = await db.collection('reviews')
                .where('productId', '==', productId)
                .where('userId', '==', req.user.id)
                .limit(1)
                .get();

            if (!existingReview.empty) {
                return res.status(409).json({
                    success: false,
                    error: 'ALREADY_REVIEWED',
                    message: 'You have already reviewed this product'
                });
            }

            // Check if user purchased this product (verified purchase)
            const orderSnapshot = await db.collection('orders')
                .where('userId', '==', req.user.id)
                .where('status', '==', 'delivered')
                .get();

            let verifiedPurchase = false;
            orderSnapshot.docs.forEach(doc => {
                const order = doc.data();
                if (order.items && order.items.some(item => item.productId === productId)) {
                    verifiedPurchase = true;
                }
            });

            // Create review
            const reviewData = {
                productId,
                productName: productDoc.data().name,
                userId: req.user.id,
                userName: req.user.displayName || req.user.email.split('@')[0],
                userEmail: req.user.email,
                rating,
                title,
                comment,
                photos,
                verifiedPurchase,
                helpfulCount: 0,
                unhelpfulCount: 0,
                isApproved: false, // Requires admin approval
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('reviews').add(reviewData);

            res.status(201).json({
                success: true,
                message: 'Review submitted successfully. It will be visible after admin approval.',
                review: {
                    id: docRef.id,
                    ...reviewData
                }
            });
        } catch (error) {
            console.error('Create review error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to create review'
            });
        }
    }
);

// ===========================
// UPDATE REVIEW
// ===========================
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, title, comment, photos } = req.body;

        const reviewRef = db.collection('reviews').doc(id);
        const reviewDoc = await reviewRef.get();

        if (!reviewDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Review not found'
            });
        }

        const review = reviewDoc.data();

        // Check authorization
        if (review.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'FORBIDDEN',
                message: 'You can only edit your own reviews'
            });
        }

        const updates = {};
        if (rating !== undefined) updates.rating = rating;
        if (title !== undefined) updates.title = title;
        if (comment !== undefined) updates.comment = comment;
        if (photos !== undefined) updates.photos = photos;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'No fields to update'
            });
        }

        updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        updates.isApproved = false; // Requires re-approval

        await reviewRef.update(updates);

        const updated = await reviewRef.get();

        res.json({
            success: true,
            message: 'Review updated successfully',
            review: {
                id: updated.id,
                ...updated.data()
            }
        });
    } catch (error) {
        console.error('Update review error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to update review'
        });
    }
});

// ===========================
// DELETE REVIEW
// ===========================
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const reviewRef = db.collection('reviews').doc(id);
        const reviewDoc = await reviewRef.get();

        if (!reviewDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Review not found'
            });
        }

        const review = reviewDoc.data();

        // Check authorization (user or admin)
        if (review.userId !== req.user.id && req.user.role !== 'GronderfulBlogs') {
            return res.status(403).json({
                success: false,
                error: 'FORBIDDEN',
                message: 'Access denied'
            });
        }

        await reviewRef.delete();

        // Update product average rating
        await updateProductRating(review.productId);

        res.json({
            success: true,
            message: 'Review deleted successfully'
        });
    } catch (error) {
        console.error('Delete review error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to delete review'
        });
    }
});

// ===========================
// MARK REVIEW AS HELPFUL
// ===========================
router.post('/:id/helpful', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { helpful } = req.body; // true or false

        const reviewRef = db.collection('reviews').doc(id);
        const reviewDoc = await reviewRef.get();

        if (!reviewDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Review not found'
            });
        }

        if (helpful) {
            await reviewRef.update({
                helpfulCount: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await reviewRef.update({
                unhelpfulCount: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        res.json({
            success: true,
            message: 'Thank you for your feedback'
        });
    } catch (error) {
        console.error('Mark helpful error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to mark review'
        });
    }
});

// ===========================
// ADMIN: GET PENDING REVIEWS
// ===========================
router.get('/admin/pending', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { limit = 50 } = req.query;

        const snapshot = await db.collection('reviews')
            .where('isApproved', '==', false)
            .orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .get();

        const reviews = [];
        snapshot.docs.forEach(doc => {
            reviews.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.json({
            success: true,
            reviews,
            count: reviews.length
        });
    } catch (error) {
        console.error('Get pending reviews error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch pending reviews'
        });
    }
});

// ===========================
// ADMIN: APPROVE/REJECT REVIEW
// ===========================
router.patch('/:id/moderate', authenticateToken, requireAdmin,
    [
        body('isApproved').isBoolean(),
        body('moderationNote').optional().trim()
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

            const { id } = req.params;
            const { isApproved, moderationNote } = req.body;

            const reviewRef = db.collection('reviews').doc(id);
            const reviewDoc = await reviewRef.get();

            if (!reviewDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'NOT_FOUND',
                    message: 'Review not found'
                });
            }

            const review = reviewDoc.data();

            await reviewRef.update({
                isApproved,
                moderatedBy: req.user.email,
                moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
                moderationNote: moderationNote || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Update product rating if approved
            if (isApproved) {
                await updateProductRating(review.productId);
            }

            const updated = await reviewRef.get();

            res.json({
                success: true,
                message: `Review ${isApproved ? 'approved' : 'rejected'} successfully`,
                review: {
                    id: updated.id,
                    ...updated.data()
                }
            });
        } catch (error) {
            console.error('Moderate review error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to moderate review'
            });
        }
    }
);

// ===========================
// ADMIN: GET ALL REVIEWS
// ===========================
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            productId,
            approved,
            limit = 50,
            offset = 0
        } = req.query;

        let query = db.collection('reviews');

        if (productId) {
            query = query.where('productId', '==', productId);
        }

        if (approved !== undefined) {
            query = query.where('isApproved', '==', approved === 'true');
        }

        query = query.orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .offset(parseInt(offset));

        const snapshot = await query.get();
        const reviews = [];

        snapshot.docs.forEach(doc => {
            reviews.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.json({
            success: true,
            reviews,
            count: reviews.length
        });
    } catch (error) {
        console.error('Get all reviews error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch reviews'
        });
    }
});

// ===========================
// HELPER FUNCTIONS
// ===========================

async function updateProductRating(productId) {
    try {
        const reviewsSnapshot = await db.collection('reviews')
            .where('productId', '==', productId)
            .where('isApproved', '==', true)
            .get();

        let totalRating = 0;
        let totalReviews = 0;

        reviewsSnapshot.docs.forEach(doc => {
            totalRating += doc.data().rating;
            totalReviews += 1;
        });

        const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;

        await db.collection('products').doc(productId).update({
            averageRating: Math.round(averageRating * 10) / 10,
            reviewCount: totalReviews,
            updatedAt: new Date()
        });
    } catch (error) {
        console.error('Update product rating error:', error);
    }
}

module.exports = router;
