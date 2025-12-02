const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');

// ===========================
// GET USER'S WISHLIST
// ===========================
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            limit = 50,
            offset = 0,
            includeProductDetails = 'true'
        } = req.query;

        const snapshot = await db.collection('wishlist')
            .where('userId', '==', req.user.id)
            .orderBy('addedAt', 'desc')
            .limit(parseInt(limit))
            .offset(parseInt(offset))
            .get();

        const wishlistItems = [];

        for (const doc of snapshot.docs) {
            const item = {
                id: doc.id,
                ...doc.data()
            };

            // Optionally include full product details
            if (includeProductDetails === 'true') {
                const productDoc = await db.collection('products').doc(item.productId).get();
                if (productDoc.exists) {
                    item.product = {
                        id: productDoc.id,
                        ...productDoc.data()
                    };
                } else {
                    // Product no longer exists
                    item.product = null;
                    item.productDeleted = true;
                }
            }

            wishlistItems.push(item);
        }

        res.json({
            success: true,
            wishlist: wishlistItems,
            count: wishlistItems.length
        });
    } catch (error) {
        console.error('Get wishlist error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch wishlist'
        });
    }
});

// ===========================
// CHECK IF PRODUCT IS IN WISHLIST
// ===========================
router.get('/check/:productId', authenticateToken, async (req, res) => {
    try {
        const { productId } = req.params;

        const snapshot = await db.collection('wishlist')
            .where('userId', '==', req.user.id)
            .where('productId', '==', productId)
            .limit(1)
            .get();

        res.json({
            success: true,
            inWishlist: !snapshot.empty,
            wishlistItemId: !snapshot.empty ? snapshot.docs[0].id : null
        });
    } catch (error) {
        console.error('Check wishlist error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to check wishlist'
        });
    }
});

// ===========================
// GET WISHLIST COUNT
// ===========================
router.get('/count', authenticateToken, async (req, res) => {
    try {
        const snapshot = await db.collection('wishlist')
            .where('userId', '==', req.user.id)
            .get();

        res.json({
            success: true,
            count: snapshot.size
        });
    } catch (error) {
        console.error('Get wishlist count error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to get wishlist count'
        });
    }
});

// ===========================
// ADD PRODUCT TO WISHLIST
// ===========================
router.post('/', authenticateToken,
    [
        body('productId').isString().notEmpty(),
        body('notes').optional().trim().isLength({ max: 500 })
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

            const { productId, notes = '' } = req.body;

            // Check if product exists
            const productDoc = await db.collection('products').doc(productId).get();
            if (!productDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'PRODUCT_NOT_FOUND',
                    message: 'Product not found'
                });
            }

            const product = productDoc.data();

            // Check if already in wishlist
            const existingSnapshot = await db.collection('wishlist')
                .where('userId', '==', req.user.id)
                .where('productId', '==', productId)
                .limit(1)
                .get();

            if (!existingSnapshot.empty) {
                return res.status(409).json({
                    success: false,
                    error: 'ALREADY_IN_WISHLIST',
                    message: 'Product is already in your wishlist',
                    wishlistItemId: existingSnapshot.docs[0].id
                });
            }

            // Add to wishlist
            const wishlistData = {
                userId: req.user.id,
                userEmail: req.user.email,
                productId,
                productName: product.name,
                productPrice: product.price,
                productImage: product.images && product.images.length > 0 ? product.images[0] : null,
                notes,
                addedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('wishlist').add(wishlistData);

            // Track analytics
            await db.collection('productAnalytics').add({
                productId,
                eventType: 'addToWishlist',
                userId: req.user.id,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // Update product wishlist count
            await db.collection('products').doc(productId).update({
                wishlistCount: admin.firestore.FieldValue.increment(1)
            });

            res.status(201).json({
                success: true,
                message: 'Product added to wishlist',
                wishlistItem: {
                    id: docRef.id,
                    ...wishlistData
                }
            });
        } catch (error) {
            console.error('Add to wishlist error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to add product to wishlist'
            });
        }
    }
);

// ===========================
// UPDATE WISHLIST ITEM NOTES
// ===========================
router.patch('/:id', authenticateToken,
    [
        body('notes').trim().isLength({ max: 500 })
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
            const { notes } = req.body;

            const wishlistRef = db.collection('wishlist').doc(id);
            const wishlistDoc = await wishlistRef.get();

            if (!wishlistDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'NOT_FOUND',
                    message: 'Wishlist item not found'
                });
            }

            const item = wishlistDoc.data();

            // Check authorization
            if (item.userId !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    error: 'FORBIDDEN',
                    message: 'Access denied'
                });
            }

            await wishlistRef.update({
                notes: notes.trim(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const updated = await wishlistRef.get();

            res.json({
                success: true,
                message: 'Wishlist item updated',
                wishlistItem: {
                    id: updated.id,
                    ...updated.data()
                }
            });
        } catch (error) {
            console.error('Update wishlist item error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to update wishlist item'
            });
        }
    }
);

// ===========================
// REMOVE FROM WISHLIST
// ===========================
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const wishlistRef = db.collection('wishlist').doc(id);
        const wishlistDoc = await wishlistRef.get();

        if (!wishlistDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Wishlist item not found'
            });
        }

        const item = wishlistDoc.data();

        // Check authorization
        if (item.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'FORBIDDEN',
                message: 'Access denied'
            });
        }

        await wishlistRef.delete();

        // Update product wishlist count
        await db.collection('products').doc(item.productId).update({
            wishlistCount: admin.firestore.FieldValue.increment(-1)
        });

        res.json({
            success: true,
            message: 'Product removed from wishlist'
        });
    } catch (error) {
        console.error('Remove from wishlist error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to remove product from wishlist'
        });
    }
});

// ===========================
// REMOVE BY PRODUCT ID
// ===========================
router.delete('/product/:productId', authenticateToken, async (req, res) => {
    try {
        const { productId } = req.params;

        const snapshot = await db.collection('wishlist')
            .where('userId', '==', req.user.id)
            .where('productId', '==', productId)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Product not in wishlist'
            });
        }

        const doc = snapshot.docs[0];
        await doc.ref.delete();

        // Update product wishlist count
        await db.collection('products').doc(productId).update({
            wishlistCount: admin.firestore.FieldValue.increment(-1)
        });

        res.json({
            success: true,
            message: 'Product removed from wishlist'
        });
    } catch (error) {
        console.error('Remove from wishlist error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to remove product from wishlist'
        });
    }
});

// ===========================
// CLEAR WISHLIST
// ===========================
router.delete('/', authenticateToken, async (req, res) => {
    try {
        const snapshot = await db.collection('wishlist')
            .where('userId', '==', req.user.id)
            .get();

        if (snapshot.empty) {
            return res.json({
                success: true,
                message: 'Wishlist is already empty',
                deletedCount: 0
            });
        }

        // Delete all items and update product counts
        const batch = db.batch();
        const productIds = [];

        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
            productIds.push(doc.data().productId);
        });

        await batch.commit();

        // Update product wishlist counts
        const productUpdatePromises = productIds.map(productId =>
            db.collection('products').doc(productId).update({
                wishlistCount: admin.firestore.FieldValue.increment(-1)
            }).catch(err => console.error('Failed to update product count:', err))
        );

        await Promise.all(productUpdatePromises);

        res.json({
            success: true,
            message: 'Wishlist cleared',
            deletedCount: snapshot.size
        });
    } catch (error) {
        console.error('Clear wishlist error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to clear wishlist'
        });
    }
});

// ===========================
// MOVE WISHLIST ITEMS TO CART
// ===========================
router.post('/move-to-cart', authenticateToken, async (req, res) => {
    try {
        const { itemIds = [] } = req.body;

        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'itemIds must be a non-empty array'
            });
        }

        const movedItems = [];
        const failedItems = [];

        for (const itemId of itemIds) {
            try {
                const wishlistDoc = await db.collection('wishlist').doc(itemId).get();

                if (!wishlistDoc.exists) {
                    failedItems.push({ itemId, reason: 'Item not found' });
                    continue;
                }

                const item = wishlistDoc.data();

                // Verify ownership
                if (item.userId !== req.user.id) {
                    failedItems.push({ itemId, reason: 'Access denied' });
                    continue;
                }

                // Check product availability
                const productDoc = await db.collection('products').doc(item.productId).get();
                if (!productDoc.exists || !productDoc.data().isActive) {
                    failedItems.push({ itemId, reason: 'Product unavailable' });
                    continue;
                }

                const product = productDoc.data();

                // Check stock
                if (product.stockQuantity < 1) {
                    failedItems.push({ itemId, reason: 'Out of stock' });
                    continue;
                }

                // Add to cart (this would typically integrate with your cart system)
                // For now, we'll just track it as moved
                movedItems.push({
                    itemId,
                    productId: item.productId,
                    productName: item.productName
                });

                // Remove from wishlist
                await wishlistDoc.ref.delete();

                // Update product wishlist count
                await db.collection('products').doc(item.productId).update({
                    wishlistCount: admin.firestore.FieldValue.increment(-1)
                });

            } catch (error) {
                failedItems.push({ itemId, reason: error.message });
            }
        }

        res.json({
            success: true,
            message: `${movedItems.length} items moved to cart`,
            movedItems,
            failedItems,
            totalProcessed: itemIds.length
        });
    } catch (error) {
        console.error('Move to cart error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to move items to cart'
        });
    }
});

// ===========================
// GET WISHLIST ANALYTICS (User)
// ===========================
router.get('/analytics/me', authenticateToken, async (req, res) => {
    try {
        const snapshot = await db.collection('wishlist')
            .where('userId', '==', req.user.id)
            .get();

        let totalItems = 0;
        let totalValue = 0;
        const categories = {};

        snapshot.docs.forEach(doc => {
            const item = doc.data();
            totalItems++;
            totalValue += item.productPrice || 0;

            // You could expand this to track categories if you store categoryId in wishlist items
        });

        res.json({
            success: true,
            analytics: {
                totalItems,
                totalValue: Math.round(totalValue * 100) / 100,
                averageItemPrice: totalItems > 0
                    ? Math.round((totalValue / totalItems) * 100) / 100
                    : 0
            }
        });
    } catch (error) {
        console.error('Get wishlist analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch wishlist analytics'
        });
    }
});

// ===========================
// SHARE WISHLIST (Generate shareable link)
// ===========================
router.post('/share', authenticateToken, async (req, res) => {
    try {
        const { expiresInDays = 30 } = req.body;

        // Create a shareable wishlist snapshot
        const snapshot = await db.collection('wishlist')
            .where('userId', '==', req.user.id)
            .get();

        if (snapshot.empty) {
            return res.status(400).json({
                success: false,
                error: 'EMPTY_WISHLIST',
                message: 'Cannot share an empty wishlist'
            });
        }

        const items = snapshot.docs.map(doc => ({
            productId: doc.data().productId,
            productName: doc.data().productName,
            productPrice: doc.data().productPrice,
            productImage: doc.data().productImage,
            notes: doc.data().notes
        }));

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays));

        const shareData = {
            userId: req.user.id,
            userName: req.user.displayName || req.user.email.split('@')[0],
            items,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            viewCount: 0
        };

        const docRef = await db.collection('sharedWishlists').add(shareData);

        res.json({
            success: true,
            message: 'Wishlist shared successfully',
            shareId: docRef.id,
            shareUrl: `${process.env.FRONTEND_URL}/wishlist/shared/${docRef.id}`,
            expiresAt
        });
    } catch (error) {
        console.error('Share wishlist error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to share wishlist'
        });
    }
});

// ===========================
// VIEW SHARED WISHLIST (Public)
// ===========================
router.get('/shared/:shareId', async (req, res) => {
    try {
        const { shareId } = req.params;

        const shareDoc = await db.collection('sharedWishlists').doc(shareId).get();

        if (!shareDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Shared wishlist not found'
            });
        }

        const shareData = shareDoc.data();

        // Check if expired
        if (shareData.expiresAt && shareData.expiresAt.toDate() < new Date()) {
            return res.status(410).json({
                success: false,
                error: 'EXPIRED',
                message: 'This shared wishlist has expired'
            });
        }

        // Increment view count
        await shareDoc.ref.update({
            viewCount: admin.firestore.FieldValue.increment(1)
        });

        res.json({
            success: true,
            sharedWishlist: {
                id: shareDoc.id,
                userName: shareData.userName,
                items: shareData.items,
                createdAt: shareData.createdAt,
                viewCount: shareData.viewCount + 1
            }
        });
    } catch (error) {
        console.error('View shared wishlist error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch shared wishlist'
        });
    }
});

module.exports = router;
