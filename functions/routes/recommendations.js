const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebase');
const { optionalAuth } = require('../middleware/auth');

// ===========================
// GET RELATED PRODUCTS
// Based on category, tags, and attributes
// ===========================
router.get('/related/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const { limit = 10 } = req.query;

        // Get the product
        const productDoc = await db.collection('products').doc(productId).get();

        if (!productDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'PRODUCT_NOT_FOUND',
                message: 'Product not found'
            });
        }

        const product = productDoc.data();
        const relatedProducts = [];
        const seenIds = new Set([productId]);

        // 1. Get products from same category
        if (product.categoryId) {
            const categoryProducts = await db.collection('products')
                .where('categoryId', '==', product.categoryId)
                .where('isActive', '==', true)
                .limit(parseInt(limit))
                .get();

            categoryProducts.docs.forEach(doc => {
                if (doc.id !== productId) {
                    relatedProducts.push({
                        id: doc.id,
                        ...doc.data(),
                        matchReason: 'Same category'
                    });
                    seenIds.add(doc.id);
                }
            });
        }

        // 2. If we don't have enough, get products with similar tags
        if (relatedProducts.length < parseInt(limit) && product.tags && product.tags.length > 0) {
            const tagProducts = await db.collection('products')
                .where('tags', 'array-contains-any', product.tags.slice(0, 10))
                .where('isActive', '==', true)
                .limit(parseInt(limit))
                .get();

            tagProducts.docs.forEach(doc => {
                if (!seenIds.has(doc.id)) {
                    relatedProducts.push({
                        id: doc.id,
                        ...doc.data(),
                        matchReason: 'Similar tags'
                    });
                    seenIds.add(doc.id);
                }
            });
        }

        // 3. Fill remaining with popular products
        if (relatedProducts.length < parseInt(limit)) {
            const popularProducts = await db.collection('products')
                .where('isActive', '==', true)
                .orderBy('views', 'desc')
                .limit(parseInt(limit))
                .get();

            popularProducts.docs.forEach(doc => {
                if (!seenIds.has(doc.id)) {
                    relatedProducts.push({
                        id: doc.id,
                        ...doc.data(),
                        matchReason: 'Popular product'
                    });
                    seenIds.add(doc.id);
                }
            });
        }

        // Limit and sort by relevance
        const limitedProducts = relatedProducts.slice(0, parseInt(limit));

        res.json({
            success: true,
            products: limitedProducts,
            count: limitedProducts.length
        });
    } catch (error) {
        console.error('Get related products error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch related products'
        });
    }
});

// ===========================
// GET FREQUENTLY BOUGHT TOGETHER
// Collaborative filtering based on order history
// ===========================
router.get('/frequently-bought-together/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const { limit = 5 } = req.query;

        // Get orders that contain this product
        const ordersSnapshot = await db.collection('orders')
            .where('status', '==', 'delivered')
            .get();

        const productCounts = {};
        let totalOrders = 0;

        ordersSnapshot.docs.forEach(doc => {
            const order = doc.data();
            const items = order.items || [];

            // Check if this order contains the target product
            const hasTargetProduct = items.some(item => item.productId === productId);

            if (hasTargetProduct) {
                totalOrders++;
                // Count all other products in this order
                items.forEach(item => {
                    if (item.productId !== productId) {
                        productCounts[item.productId] = (productCounts[item.productId] || 0) + 1;
                    }
                });
            }
        });

        // Sort by frequency and get top products
        const sortedProducts = Object.entries(productCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, parseInt(limit));

        // Fetch product details
        const recommendations = [];
        for (const [prodId, count] of sortedProducts) {
            const productDoc = await db.collection('products').doc(prodId).get();
            if (productDoc.exists && productDoc.data().isActive) {
                recommendations.push({
                    id: productDoc.id,
                    ...productDoc.data(),
                    boughtTogetherCount: count,
                    boughtTogetherPercentage: totalOrders > 0
                        ? Math.round((count / totalOrders) * 100)
                        : 0
                });
            }
        }

        res.json({
            success: true,
            products: recommendations,
            count: recommendations.length,
            totalOrdersAnalyzed: totalOrders
        });
    } catch (error) {
        console.error('Get frequently bought together error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch frequently bought together products'
        });
    }
});

// ===========================
// GET PERSONALIZED RECOMMENDATIONS
// Based on user behavior (views, wishlist, purchases)
// ===========================
router.get('/personalized', optionalAuth, async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        if (!req.user) {
            // If not logged in, return trending products
            return getTrendingProducts(req, res);
        }

        const userId = req.user.id;
        const recommendations = [];
        const seenIds = new Set();

        // 1. Get categories from user's purchase history
        const ordersSnapshot = await db.collection('orders')
            .where('userId', '==', userId)
            .limit(10)
            .get();

        const purchasedCategories = new Set();
        const purchasedTags = new Set();

        ordersSnapshot.docs.forEach(doc => {
            const order = doc.data();
            (order.items || []).forEach(item => {
                // Track the product as purchased
                seenIds.add(item.productId);
            });
        });

        // Get user's wishlisted products to understand preferences
        const wishlistSnapshot = await db.collection('wishlist')
            .where('userId', '==', userId)
            .limit(20)
            .get();

        for (const doc of wishlistSnapshot.docs) {
            const item = doc.data();
            seenIds.add(item.productId);

            // Get the product to extract category and tags
            const productDoc = await db.collection('products').doc(item.productId).get();
            if (productDoc.exists) {
                const product = productDoc.data();
                if (product.categoryId) purchasedCategories.add(product.categoryId);
                if (product.tags) product.tags.forEach(tag => purchasedTags.add(tag));
            }
        }

        // Get user's viewed products
        const viewsSnapshot = await db.collection('productAnalytics')
            .where('userId', '==', userId)
            .where('eventType', '==', 'view')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();

        viewsSnapshot.docs.forEach(doc => {
            const view = doc.data();
            seenIds.add(view.productId);
        });

        // 2. Recommend products from preferred categories
        if (purchasedCategories.size > 0) {
            const categoryArray = Array.from(purchasedCategories);
            for (const categoryId of categoryArray) {
                if (recommendations.length >= parseInt(limit)) break;

                const categoryProducts = await db.collection('products')
                    .where('categoryId', '==', categoryId)
                    .where('isActive', '==', true)
                    .orderBy('views', 'desc')
                    .limit(5)
                    .get();

                categoryProducts.docs.forEach(doc => {
                    if (!seenIds.has(doc.id) && recommendations.length < parseInt(limit)) {
                        recommendations.push({
                            id: doc.id,
                            ...doc.data(),
                            recommendationReason: 'Based on your preferences'
                        });
                        seenIds.add(doc.id);
                    }
                });
            }
        }

        // 3. Recommend products with similar tags
        if (recommendations.length < parseInt(limit) && purchasedTags.size > 0) {
            const tagsArray = Array.from(purchasedTags).slice(0, 10);
            const tagProducts = await db.collection('products')
                .where('tags', 'array-contains-any', tagsArray)
                .where('isActive', '==', true)
                .limit(parseInt(limit))
                .get();

            tagProducts.docs.forEach(doc => {
                if (!seenIds.has(doc.id) && recommendations.length < parseInt(limit)) {
                    recommendations.push({
                        id: doc.id,
                        ...doc.data(),
                        recommendationReason: 'Matches your interests'
                    });
                    seenIds.add(doc.id);
                }
            });
        }

        // 4. Fill remaining with trending products
        if (recommendations.length < parseInt(limit)) {
            const trendingProducts = await db.collection('products')
                .where('isActive', '==', true)
                .orderBy('purchases', 'desc')
                .limit(parseInt(limit))
                .get();

            trendingProducts.docs.forEach(doc => {
                if (!seenIds.has(doc.id) && recommendations.length < parseInt(limit)) {
                    recommendations.push({
                        id: doc.id,
                        ...doc.data(),
                        recommendationReason: 'Trending now'
                    });
                    seenIds.add(doc.id);
                }
            });
        }

        res.json({
            success: true,
            products: recommendations.slice(0, parseInt(limit)),
            count: recommendations.length,
            personalized: true
        });
    } catch (error) {
        console.error('Get personalized recommendations error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch personalized recommendations'
        });
    }
});

// ===========================
// GET TRENDING PRODUCTS
// Most viewed, most purchased, or most wishlisted
// ===========================
async function getTrendingProducts(req, res) {
    try {
        const { limit = 20, metric = 'views' } = req.query;

        let sortField = 'views';
        if (metric === 'purchases') {
            sortField = 'purchases';
        } else if (metric === 'wishlist') {
            sortField = 'wishlistCount';
        } else if (metric === 'revenue') {
            sortField = 'revenue';
        }

        const productsSnapshot = await db.collection('products')
            .where('isActive', '==', true)
            .orderBy(sortField, 'desc')
            .limit(parseInt(limit))
            .get();

        const products = productsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json({
            success: true,
            products,
            count: products.length,
            metric: sortField
        });
    } catch (error) {
        console.error('Get trending products error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch trending products'
        });
    }
}

router.get('/trending', getTrendingProducts);

// ===========================
// GET NEW ARRIVALS
// Recently added products
// ===========================
router.get('/new-arrivals', async (req, res) => {
    try {
        const { limit = 20, days = 30 } = req.query;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

        const productsSnapshot = await db.collection('products')
            .where('isActive', '==', true)
            .where('createdAt', '>=', cutoffDate)
            .orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .get();

        const products = productsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json({
            success: true,
            products,
            count: products.length,
            daysBack: parseInt(days)
        });
    } catch (error) {
        console.error('Get new arrivals error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch new arrivals'
        });
    }
});

// ===========================
// GET PRODUCTS YOU MAY LIKE
// Based on specific product view
// ===========================
router.get('/you-may-like/:productId', optionalAuth, async (req, res) => {
    try {
        const { productId } = req.params;
        const { limit = 10 } = req.query;

        const recommendations = [];
        const seenIds = new Set([productId]);

        // Get the viewed product
        const productDoc = await db.collection('products').doc(productId).get();

        if (!productDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'PRODUCT_NOT_FOUND',
                message: 'Product not found'
            });
        }

        const product = productDoc.data();

        // If user is logged in, check their purchase/wishlist history for personalization
        if (req.user) {
            // Get user's preferred categories
            const wishlistSnapshot = await db.collection('wishlist')
                .where('userId', '==', req.user.id)
                .limit(10)
                .get();

            const preferredCategories = new Set();
            for (const doc of wishlistSnapshot.docs) {
                const item = doc.data();
                const itemProduct = await db.collection('products').doc(item.productId).get();
                if (itemProduct.exists && itemProduct.data().categoryId) {
                    preferredCategories.add(itemProduct.data().categoryId);
                }
            }

            // Recommend from preferred categories
            for (const categoryId of preferredCategories) {
                if (recommendations.length >= parseInt(limit)) break;

                const categoryProducts = await db.collection('products')
                    .where('categoryId', '==', categoryId)
                    .where('isActive', '==', true)
                    .orderBy('views', 'desc')
                    .limit(5)
                    .get();

                categoryProducts.docs.forEach(doc => {
                    if (!seenIds.has(doc.id) && recommendations.length < parseInt(limit)) {
                        recommendations.push({
                            id: doc.id,
                            ...doc.data()
                        });
                        seenIds.add(doc.id);
                    }
                });
            }
        }

        // Get products from same category as viewed product
        if (recommendations.length < parseInt(limit) && product.categoryId) {
            const categoryProducts = await db.collection('products')
                .where('categoryId', '==', product.categoryId)
                .where('isActive', '==', true)
                .orderBy('views', 'desc')
                .limit(parseInt(limit))
                .get();

            categoryProducts.docs.forEach(doc => {
                if (!seenIds.has(doc.id) && recommendations.length < parseInt(limit)) {
                    recommendations.push({
                        id: doc.id,
                        ...doc.data()
                    });
                    seenIds.add(doc.id);
                }
            });
        }

        // Fill remaining with similar tags
        if (recommendations.length < parseInt(limit) && product.tags && product.tags.length > 0) {
            const tagProducts = await db.collection('products')
                .where('tags', 'array-contains-any', product.tags.slice(0, 10))
                .where('isActive', '==', true)
                .limit(parseInt(limit))
                .get();

            tagProducts.docs.forEach(doc => {
                if (!seenIds.has(doc.id) && recommendations.length < parseInt(limit)) {
                    recommendations.push({
                        id: doc.id,
                        ...doc.data()
                    });
                    seenIds.add(doc.id);
                }
            });
        }

        res.json({
            success: true,
            products: recommendations.slice(0, parseInt(limit)),
            count: recommendations.length
        });
    } catch (error) {
        console.error('Get you may like products error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch recommendations'
        });
    }
});

// ===========================
// GET USERS ALSO VIEWED
// Products viewed by users who viewed this product
// ===========================
router.get('/also-viewed/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const { limit = 10 } = req.query;

        // Get users who viewed this product
        const viewsSnapshot = await db.collection('productAnalytics')
            .where('productId', '==', productId)
            .where('eventType', '==', 'view')
            .limit(100)
            .get();

        const userIds = [...new Set(viewsSnapshot.docs.map(doc => doc.data().userId))];

        if (userIds.length === 0) {
            return res.json({
                success: true,
                products: [],
                count: 0
            });
        }

        // Get other products these users viewed
        const productCounts = {};

        for (const userId of userIds) {
            const userViewsSnapshot = await db.collection('productAnalytics')
                .where('userId', '==', userId)
                .where('eventType', '==', 'view')
                .limit(20)
                .get();

            userViewsSnapshot.docs.forEach(doc => {
                const view = doc.data();
                if (view.productId !== productId) {
                    productCounts[view.productId] = (productCounts[view.productId] || 0) + 1;
                }
            });
        }

        // Sort by frequency
        const sortedProducts = Object.entries(productCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, parseInt(limit));

        // Fetch product details
        const recommendations = [];
        for (const [prodId, count] of sortedProducts) {
            const productDoc = await db.collection('products').doc(prodId).get();
            if (productDoc.exists && productDoc.data().isActive) {
                recommendations.push({
                    id: productDoc.id,
                    ...productDoc.data(),
                    viewedByCount: count
                });
            }
        }

        res.json({
            success: true,
            products: recommendations,
            count: recommendations.length
        });
    } catch (error) {
        console.error('Get also viewed products error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch also viewed products'
        });
    }
});

// ===========================
// GET BEST SELLERS BY CATEGORY
// ===========================
router.get('/best-sellers/:categoryId?', async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { limit = 20 } = req.query;

        let query = db.collection('products')
            .where('isActive', '==', true);

        if (categoryId && categoryId !== 'all') {
            query = query.where('categoryId', '==', categoryId);
        }

        const productsSnapshot = await query
            .orderBy('purchases', 'desc')
            .limit(parseInt(limit))
            .get();

        const products = productsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json({
            success: true,
            products,
            count: products.length,
            categoryId: categoryId || 'all'
        });
    } catch (error) {
        console.error('Get best sellers error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch best sellers'
        });
    }
});

module.exports = router;
