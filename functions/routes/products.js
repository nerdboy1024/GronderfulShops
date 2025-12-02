const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db } = require('../config/firebase');
const { authenticateTokenOrApiKey, requireAdmin, optionalAuth } = require('../middleware/auth');

// ===========================
// GET ALL PRODUCTS (Public)
// ===========================
router.get('/', optionalAuth, async (req, res) => {
    try {
        const {
            category,
            featured,
            search,
            sort = 'createdAt',
            order = 'desc',
            limit = 20,
            offset = 0
        } = req.query;

        // Start with base query
        let query = db.collection('products').where('isActive', '==', true);

        // Filter by category
        if (category) {
            const categoryDoc = await db.collection('categories')
                .where('slug', '==', category)
                .limit(1)
                .get();

            if (!categoryDoc.empty) {
                const categoryId = categoryDoc.docs[0].id;
                query = query.where('categoryId', '==', categoryId);
            }
        }

        // Filter by featured
        if (featured === 'true') {
            query = query.where('isFeatured', '==', true);
        }

        // Apply sorting
        const validSortFields = ['createdAt', 'name', 'price', 'stockQuantity'];
        const sortField = validSortFields.includes(sort) ? sort : 'createdAt';
        const sortOrder = order.toLowerCase() === 'asc' ? 'asc' : 'desc';
        query = query.orderBy(sortField, sortOrder);

        // Execute query
        const snapshot = await query.get();
        let products = [];

        snapshot.forEach(doc => {
            products.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Apply search filter (client-side since Firestore doesn't support full-text search)
        if (search) {
            const searchLower = search.toLowerCase();
            products = products.filter(p =>
                p.name.toLowerCase().includes(searchLower) ||
                (p.description && p.description.toLowerCase().includes(searchLower))
            );
        }

        // Get total before pagination
        const total = products.length;

        // Apply pagination
        const startIndex = parseInt(offset);
        const endIndex = startIndex + parseInt(limit);
        products = products.slice(startIndex, endIndex);

        // Fetch category names for products
        for (let product of products) {
            if (product.categoryId) {
                const catDoc = await db.collection('categories').doc(product.categoryId).get();
                if (catDoc.exists) {
                    const catData = catDoc.data();
                    product.categoryName = catData.name;
                    product.categorySlug = catData.slug;
                }
            }
        }

        res.json({
            products,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: parseInt(offset) + parseInt(limit) < total
            }
        });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to fetch products'
        });
    }
});

// ===========================
// GET SINGLE PRODUCT (Public)
// ===========================
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const snapshot = await db.collection('products')
            .where('slug', '==', slug)
            .where('isActive', '==', true)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Product not found'
            });
        }

        const productDoc = snapshot.docs[0];
        const product = {
            id: productDoc.id,
            ...productDoc.data()
        };

        // Fetch category info
        if (product.categoryId) {
            const catDoc = await db.collection('categories').doc(product.categoryId).get();
            if (catDoc.exists) {
                const catData = catDoc.data();
                product.categoryName = catData.name;
                product.categorySlug = catData.slug;
            }
        }

        res.json({ product });
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to fetch product'
        });
    }
});

// ===========================
// CREATE PRODUCT (Admin only)
// ===========================
router.post('/', authenticateTokenOrApiKey, requireAdmin,
    [
        body('name').trim().notEmpty(),
        body('slug').trim().notEmpty().matches(/^[a-z0-9-]+$/),
        body('description').optional().trim(),
        body('price').isFloat({ min: 0 }),
        body('compareAtPrice').optional().isFloat({ min: 0 }),
        body('stockQuantity').optional().isInt({ min: 0 }),
        body('categoryId').optional().isString(),
        body('imageUrl').optional().isURL(),
        body('isFeatured').optional().isBoolean()
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

            const {
                name,
                slug,
                description,
                price,
                compareAtPrice,
                stockQuantity = 0,
                categoryId,
                imageUrl,
                images = [],
                isFeatured = false,
                metadata = {},
                variants = []
            } = req.body;

            // Check if slug already exists
            const existing = await db.collection('products')
                .where('slug', '==', slug)
                .limit(1)
                .get();

            if (!existing.empty) {
                return res.status(409).json({
                    error: 'ConflictError',
                    message: 'Product with this slug already exists'
                });
            }

            // Create product
            const productData = {
                name,
                slug,
                description: description || '',
                price: parseFloat(price),
                compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
                stockQuantity: parseInt(stockQuantity),
                categoryId: categoryId || null,
                imageUrl: imageUrl || null,
                images: images,
                isFeatured,
                isActive: true,
                metadata,
                variants,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const docRef = await db.collection('products').add(productData);

            res.status(201).json({
                message: 'Product created successfully',
                product: {
                    id: docRef.id,
                    ...productData
                }
            });
        } catch (error) {
            console.error('Create product error:', error);
            res.status(500).json({
                error: 'ServerError',
                message: 'Failed to create product'
            });
        }
    }
);

// ===========================
// UPDATE PRODUCT (Admin only)
// ===========================
router.put('/:id', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if product exists
        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Product not found'
            });
        }

        // Build update data
        const allowedFields = [
            'name', 'slug', 'description', 'price', 'compareAtPrice',
            'stockQuantity', 'categoryId', 'imageUrl', 'images',
            'isActive', 'isFeatured', 'metadata', 'variants'
        ];

        const updates = {};
        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                updates[key] = req.body[key];
            }
        });

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                error: 'ValidationError',
                message: 'No valid fields to update'
            });
        }

        updates.updatedAt = new Date();

        // Update product
        await productRef.update(updates);

        const updated = await productRef.get();

        res.json({
            message: 'Product updated successfully',
            product: {
                id: updated.id,
                ...updated.data()
            }
        });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to update product'
        });
    }
});

// ===========================
// PATCH PRODUCT FIELD (Admin only)
// Update individual fields
// ===========================
router.patch('/:id', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Product not found'
            });
        }

        const allowedFields = [
            'name', 'slug', 'description', 'price', 'compareAtPrice',
            'stockQuantity', 'categoryId', 'imageUrl', 'images',
            'isActive', 'isFeatured', 'metadata', 'variants',
            'sku', 'weight', 'dimensions', 'tags', 'seoTitle', 'seoDescription'
        ];

        const updates = {};
        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                updates[key] = req.body[key];
            }
        });

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                error: 'ValidationError',
                message: 'No valid fields to update'
            });
        }

        updates.updatedAt = new Date();

        await productRef.update(updates);

        const updated = await productRef.get();

        res.json({
            message: 'Product updated successfully',
            product: {
                id: updated.id,
                ...updated.data()
            }
        });
    } catch (error) {
        console.error('Patch product error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to update product'
        });
    }
});

// ===========================
// UPDATE PRODUCT TITLE (Admin only)
// ===========================
router.patch('/:id/title', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({
                error: 'ValidationError',
                message: 'Name is required and must be a non-empty string'
            });
        }

        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Product not found'
            });
        }

        await productRef.update({
            name: name.trim(),
            updatedAt: new Date()
        });

        res.json({
            message: 'Product title updated successfully',
            name: name.trim()
        });
    } catch (error) {
        console.error('Update title error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to update product title'
        });
    }
});

// ===========================
// UPDATE PRODUCT DESCRIPTION (Admin only)
// ===========================
router.patch('/:id/description', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { description } = req.body;

        if (typeof description !== 'string') {
            return res.status(400).json({
                error: 'ValidationError',
                message: 'Description must be a string'
            });
        }

        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Product not found'
            });
        }

        await productRef.update({
            description: description.trim(),
            updatedAt: new Date()
        });

        res.json({
            message: 'Product description updated successfully',
            description: description.trim()
        });
    } catch (error) {
        console.error('Update description error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to update product description'
        });
    }
});

// ===========================
// UPDATE PRODUCT PRICE (Admin only)
// ===========================
router.patch('/:id/price', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { price, compareAtPrice } = req.body;

        if (price === undefined || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
            return res.status(400).json({
                error: 'ValidationError',
                message: 'Price must be a valid non-negative number'
            });
        }

        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Product not found'
            });
        }

        const updates = {
            price: parseFloat(price),
            updatedAt: new Date()
        };

        if (compareAtPrice !== undefined) {
            updates.compareAtPrice = compareAtPrice ? parseFloat(compareAtPrice) : null;
        }

        await productRef.update(updates);

        res.json({
            message: 'Product price updated successfully',
            price: updates.price,
            compareAtPrice: updates.compareAtPrice
        });
    } catch (error) {
        console.error('Update price error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to update product price'
        });
    }
});

// ===========================
// UPDATE PRODUCT STOCK (Admin only)
// ===========================
router.patch('/:id/stock', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { stockQuantity, adjustment } = req.body;

        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Product not found'
            });
        }

        let newStock;

        if (adjustment !== undefined) {
            // Relative adjustment (+5 or -3)
            const currentStock = productDoc.data().stockQuantity || 0;
            newStock = currentStock + parseInt(adjustment);
            if (newStock < 0) newStock = 0;
        } else if (stockQuantity !== undefined) {
            // Absolute value
            newStock = parseInt(stockQuantity);
            if (newStock < 0) newStock = 0;
        } else {
            return res.status(400).json({
                error: 'ValidationError',
                message: 'Either stockQuantity or adjustment is required'
            });
        }

        await productRef.update({
            stockQuantity: newStock,
            updatedAt: new Date()
        });

        res.json({
            message: 'Product stock updated successfully',
            stockQuantity: newStock
        });
    } catch (error) {
        console.error('Update stock error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to update product stock'
        });
    }
});

// ===========================
// UPDATE PRODUCT IMAGES (Admin only)
// ===========================
router.patch('/:id/images', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { imageUrl, images } = req.body;

        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Product not found'
            });
        }

        const updates = { updatedAt: new Date() };

        if (imageUrl !== undefined) {
            updates.imageUrl = imageUrl;
        }

        if (images !== undefined) {
            if (!Array.isArray(images)) {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: 'Images must be an array'
                });
            }
            updates.images = images;
        }

        await productRef.update(updates);

        res.json({
            message: 'Product images updated successfully',
            imageUrl: updates.imageUrl,
            images: updates.images
        });
    } catch (error) {
        console.error('Update images error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to update product images'
        });
    }
});

// ===========================
// UPDATE PRODUCT CATEGORY (Admin only)
// ===========================
router.patch('/:id/category', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { categoryId } = req.body;

        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Product not found'
            });
        }

        // Verify category exists if provided
        if (categoryId) {
            const categoryDoc = await db.collection('categories').doc(categoryId).get();
            if (!categoryDoc.exists) {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: 'Category not found'
                });
            }
        }

        await productRef.update({
            categoryId: categoryId || null,
            updatedAt: new Date()
        });

        res.json({
            message: 'Product category updated successfully',
            categoryId: categoryId || null
        });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to update product category'
        });
    }
});

// ===========================
// UPDATE PRODUCT STATUS (Admin only)
// ===========================
router.patch('/:id/status', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive, isFeatured } = req.body;

        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Product not found'
            });
        }

        const updates = { updatedAt: new Date() };

        if (isActive !== undefined) {
            updates.isActive = Boolean(isActive);
        }

        if (isFeatured !== undefined) {
            updates.isFeatured = Boolean(isFeatured);
        }

        await productRef.update(updates);

        res.json({
            message: 'Product status updated successfully',
            isActive: updates.isActive,
            isFeatured: updates.isFeatured
        });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to update product status'
        });
    }
});

// ===========================
// UPDATE PRODUCT SEO (Admin only)
// ===========================
router.patch('/:id/seo', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { slug, seoTitle, seoDescription } = req.body;

        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Product not found'
            });
        }

        const updates = { updatedAt: new Date() };

        if (slug !== undefined) {
            // Validate slug format
            if (!/^[a-z0-9-]+$/.test(slug)) {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: 'Slug must contain only lowercase letters, numbers, and hyphens'
                });
            }
            // Check if slug is already used by another product
            const existing = await db.collection('products')
                .where('slug', '==', slug)
                .limit(1)
                .get();

            if (!existing.empty && existing.docs[0].id !== id) {
                return res.status(409).json({
                    error: 'ConflictError',
                    message: 'Slug is already in use'
                });
            }
            updates.slug = slug;
        }

        if (seoTitle !== undefined) {
            updates.seoTitle = seoTitle;
        }

        if (seoDescription !== undefined) {
            updates.seoDescription = seoDescription;
        }

        await productRef.update(updates);

        res.json({
            message: 'Product SEO updated successfully',
            slug: updates.slug,
            seoTitle: updates.seoTitle,
            seoDescription: updates.seoDescription
        });
    } catch (error) {
        console.error('Update SEO error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to update product SEO'
        });
    }
});

// ===========================
// DELETE PRODUCT (Admin only)
// ===========================
router.delete('/:id', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Product not found'
            });
        }

        // Soft delete (set isActive to false)
        await productRef.update({
            isActive: false,
            updatedAt: new Date()
        });

        res.json({
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to delete product'
        });
    }
});

// ===========================
// BULK DELETE PRODUCTS (Admin only)
// ===========================
router.post('/bulk/delete', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { productIds } = req.body;

        if (!Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({
                error: 'ValidationError',
                message: 'productIds must be a non-empty array'
            });
        }

        const batch = db.batch();
        const updatedAt = new Date();

        for (const id of productIds) {
            const productRef = db.collection('products').doc(id);
            batch.update(productRef, { isActive: false, updatedAt });
        }

        await batch.commit();

        res.json({
            message: `${productIds.length} products deleted successfully`
        });
    } catch (error) {
        console.error('Bulk delete error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to delete products'
        });
    }
});

// ===========================
// BULK UPDATE PRODUCTS (Admin only)
// ===========================
router.post('/bulk/update', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { productIds, updates } = req.body;

        if (!Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({
                error: 'ValidationError',
                message: 'productIds must be a non-empty array'
            });
        }

        if (!updates || typeof updates !== 'object') {
            return res.status(400).json({
                error: 'ValidationError',
                message: 'updates must be an object'
            });
        }

        const batch = db.batch();
        updates.updatedAt = new Date();

        for (const id of productIds) {
            const productRef = db.collection('products').doc(id);
            batch.update(productRef, updates);
        }

        await batch.commit();

        res.json({
            message: `${productIds.length} products updated successfully`
        });
    } catch (error) {
        console.error('Bulk update error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to update products'
        });
    }
});

// ===========================
// PRODUCT ANALYTICS ENDPOINTS
// ===========================

const { admin } = require('../config/firebase');

/**
 * POST /api/products/analytics/track
 * Track product analytics (views, add to cart, purchases, etc.)
 * Public endpoint for tracking user interactions
 */
router.post('/analytics/track', async (req, res) => {
    try {
        const {
            productId,
            slug,
            eventType, // 'view', 'addToCart', 'removeFromCart', 'purchase', 'wishlist'
            data
        } = req.body;

        if (!productId && !slug) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Product ID or slug is required'
            });
        }

        // Find product
        let productDoc;
        if (productId) {
            productDoc = await db.collection('products').doc(productId).get();
        } else {
            const snapshot = await db.collection('products').where('slug', '==', slug).limit(1).get();
            if (!snapshot.empty) {
                productDoc = snapshot.docs[0];
            }
        }

        if (!productDoc || !productDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'PRODUCT_NOT_FOUND',
                message: 'Product not found'
            });
        }

        // Store analytics event
        const analyticsData = {
            productId: productDoc.id,
            slug: productDoc.data().slug,
            eventType,
            data: data || {},
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userAgent: req.headers['user-agent'] || '',
            referrer: req.headers['referer'] || req.headers['referrer'] || '',
            ip: req.ip || req.connection.remoteAddress
        };

        await db.collection('productAnalytics').add(analyticsData);

        // Update product-level aggregated stats
        const updates = {};

        if (eventType === 'view') {
            updates.views = admin.firestore.FieldValue.increment(1);
        } else if (eventType === 'addToCart') {
            updates.addToCartCount = admin.firestore.FieldValue.increment(1);
        } else if (eventType === 'purchase') {
            updates.purchases = admin.firestore.FieldValue.increment(data.quantity || 1);
            updates.revenue = admin.firestore.FieldValue.increment(data.amount || 0);
        } else if (eventType === 'wishlist') {
            updates.wishlistCount = admin.firestore.FieldValue.increment(1);
        }

        if (Object.keys(updates).length > 0) {
            await db.collection('products').doc(productDoc.id).update(updates);
        }

        res.json({
            success: true,
            message: 'Analytics tracked successfully'
        });

    } catch (error) {
        console.error('Error tracking product analytics:', error);
        res.status(500).json({
            success: false,
            error: 'TRACKING_FAILED',
            message: error.message
        });
    }
});

/**
 * POST /api/products/analytics/search
 * Track product search queries
 */
router.post('/analytics/search', async (req, res) => {
    try {
        const { query, resultsCount, filters } = req.body;

        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Search query is required'
            });
        }

        const searchData = {
            query: query.toLowerCase().trim(),
            resultsCount: resultsCount || 0,
            filters: filters || {},
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userAgent: req.headers['user-agent'] || '',
            referrer: req.headers['referer'] || req.headers['referrer'] || ''
        };

        await db.collection('productSearchAnalytics').add(searchData);

        res.json({
            success: true,
            message: 'Search tracked successfully'
        });

    } catch (error) {
        console.error('Error tracking search:', error);
        res.status(500).json({
            success: false,
            error: 'TRACKING_FAILED',
            message: error.message
        });
    }
});

/**
 * GET /api/products/analytics/popular
 * Get popular products based on views, purchases, and engagement
 */
router.get('/analytics/popular', async (req, res) => {
    try {
        const { limit = 10, metric = 'views' } = req.query;

        // Valid metrics: views, purchases, addToCartCount
        const validMetrics = ['views', 'purchases', 'addToCartCount'];
        const sortMetric = validMetrics.includes(metric) ? metric : 'views';

        // Get products sorted by the metric
        const snapshot = await db.collection('products')
            .where('isActive', '==', true)
            .orderBy(sortMetric, 'desc')
            .limit(parseInt(limit))
            .get();

        const products = snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            slug: doc.data().slug,
            price: doc.data().price,
            imageUrl: doc.data().imageUrl,
            views: doc.data().views || 0,
            purchases: doc.data().purchases || 0,
            addToCartCount: doc.data().addToCartCount || 0,
            revenue: doc.data().revenue || 0
        }));

        res.json({
            success: true,
            products
        });

    } catch (error) {
        console.error('Error fetching popular products:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_FAILED',
            message: error.message
        });
    }
});

/**
 * GET /api/products/analytics/dashboard
 * Get product analytics dashboard (admin only)
 */
router.get('/analytics/dashboard', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { period = '30d' } = req.query;

        // Calculate date range
        const now = new Date();
        const days = parseInt(period) || 30;
        const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

        // Get all active products
        const productsSnapshot = await db.collection('products')
            .where('isActive', '==', true)
            .get();

        // Calculate aggregate metrics
        let totalViews = 0;
        let totalPurchases = 0;
        let totalRevenue = 0;
        let totalAddToCart = 0;

        productsSnapshot.docs.forEach(doc => {
            totalViews += doc.data().views || 0;
            totalPurchases += doc.data().purchases || 0;
            totalRevenue += doc.data().revenue || 0;
            totalAddToCart += doc.data().addToCartCount || 0;
        });

        // Get top performing products
        const topByViews = await db.collection('products')
            .where('isActive', '==', true)
            .orderBy('views', 'desc')
            .limit(5)
            .get();

        const topByRevenue = await db.collection('products')
            .where('isActive', '==', true)
            .orderBy('revenue', 'desc')
            .limit(5)
            .get();

        const topProductsByViews = topByViews.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            slug: doc.data().slug,
            views: doc.data().views || 0,
            purchases: doc.data().purchases || 0,
            revenue: doc.data().revenue || 0
        }));

        const topProductsByRevenue = topByRevenue.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            slug: doc.data().slug,
            views: doc.data().views || 0,
            purchases: doc.data().purchases || 0,
            revenue: doc.data().revenue || 0
        }));

        // Get top search queries
        const searchSnapshot = await db.collection('productSearchAnalytics')
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
            .get();

        const searchCounts = {};
        searchSnapshot.docs.forEach(doc => {
            const query = doc.data().query;
            searchCounts[query] = (searchCounts[query] || 0) + 1;
        });

        const topSearches = Object.entries(searchCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([query, count]) => ({ query, count }));

        // Get category performance
        const categoryStats = {};
        for (const doc of productsSnapshot.docs) {
            const product = doc.data();
            const categoryId = product.categoryId || 'uncategorized';

            if (!categoryStats[categoryId]) {
                categoryStats[categoryId] = {
                    count: 0,
                    views: 0,
                    purchases: 0,
                    revenue: 0
                };
            }

            categoryStats[categoryId].count += 1;
            categoryStats[categoryId].views += product.views || 0;
            categoryStats[categoryId].purchases += product.purchases || 0;
            categoryStats[categoryId].revenue += product.revenue || 0;
        }

        // Get event counts
        const analyticsSnapshot = await db.collection('productAnalytics')
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
            .get();

        const eventCounts = {
            views: 0,
            addToCart: 0,
            purchase: 0,
            wishlist: 0
        };

        analyticsSnapshot.docs.forEach(doc => {
            const eventType = doc.data().eventType;
            if (eventCounts[eventType] !== undefined) {
                eventCounts[eventType] += 1;
            }
        });

        // Calculate conversion rate
        const conversionRate = totalViews > 0
            ? Math.round((totalPurchases / totalViews) * 100 * 100) / 100
            : 0;

        const cartConversionRate = totalAddToCart > 0
            ? Math.round((totalPurchases / totalAddToCart) * 100 * 100) / 100
            : 0;

        res.json({
            success: true,
            dashboard: {
                overview: {
                    totalProducts: productsSnapshot.size,
                    totalViews,
                    totalPurchases,
                    totalRevenue: Math.round(totalRevenue * 100) / 100,
                    totalAddToCart,
                    avgViewsPerProduct: productsSnapshot.size > 0 ? Math.round(totalViews / productsSnapshot.size) : 0,
                    conversionRate,
                    cartConversionRate
                },
                topProductsByViews,
                topProductsByRevenue,
                topSearches,
                categoryStats,
                eventCounts,
                period: `${days} days`
            }
        });

    } catch (error) {
        console.error('Error fetching dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_FAILED',
            message: error.message
        });
    }
});

/**
 * GET /api/products/analytics/product/:id
 * Get detailed analytics for a specific product (admin only)
 */
router.get('/analytics/product/:id', authenticateTokenOrApiKey, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { period = '30d' } = req.query;

        const productDoc = await db.collection('products').doc(id).get();

        if (!productDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'PRODUCT_NOT_FOUND',
                message: 'Product not found'
            });
        }

        // Calculate date range
        const now = new Date();
        const days = parseInt(period) || 30;
        const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

        // Get analytics events for this product
        const eventsSnapshot = await db.collection('productAnalytics')
            .where('productId', '==', id)
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
            .get();

        const analytics = {
            views: 0,
            addToCart: 0,
            purchases: 0,
            wishlist: 0,
            revenue: 0,
            referrers: {},
            devices: {}
        };

        eventsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const eventType = data.eventType;

            if (eventType === 'view') {
                analytics.views += 1;
            } else if (eventType === 'addToCart') {
                analytics.addToCart += 1;
            } else if (eventType === 'purchase') {
                analytics.purchases += data.data?.quantity || 1;
                analytics.revenue += data.data?.amount || 0;
            } else if (eventType === 'wishlist') {
                analytics.wishlist += 1;
            }

            // Track referrers
            const referrer = data.referrer || 'Direct';
            analytics.referrers[referrer] = (analytics.referrers[referrer] || 0) + 1;

            // Track devices
            const ua = data.userAgent || '';
            const device = ua.includes('Mobile') ? 'Mobile' : 'Desktop';
            analytics.devices[device] = (analytics.devices[device] || 0) + 1;
        });

        // Convert to arrays
        analytics.topReferrers = Object.entries(analytics.referrers)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([source, count]) => ({ source, count }));

        analytics.deviceBreakdown = Object.entries(analytics.devices)
            .map(([device, count]) => ({ device, count }));

        // Calculate conversion rates
        analytics.viewToCartRate = analytics.views > 0
            ? Math.round((analytics.addToCart / analytics.views) * 100 * 100) / 100
            : 0;

        analytics.cartToPurchaseRate = analytics.addToCart > 0
            ? Math.round((analytics.purchases / analytics.addToCart) * 100 * 100) / 100
            : 0;

        delete analytics.referrers;
        delete analytics.devices;

        res.json({
            success: true,
            product: {
                id: productDoc.id,
                name: productDoc.data().name,
                slug: productDoc.data().slug,
                price: productDoc.data().price
            },
            analytics,
            period: `${days} days`
        });

    } catch (error) {
        console.error('Error fetching product analytics:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_FAILED',
            message: error.message
        });
    }
});

module.exports = router;
