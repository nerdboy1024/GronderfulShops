const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../config/firebase');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');

// Generate unique order number
const generateOrderNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${timestamp}-${random}`;
};

// ===========================
// CREATE ORDER
// ===========================
router.post('/', optionalAuth,
    [
        body('items').isArray({ min: 1 }),
        body('items.*.productId').isString(),
        body('items.*.quantity').isInt({ min: 1 }),
        body('items.*.variantId').optional().isString(),
        body('customerEmail').isEmail(),
        body('customerName').trim().notEmpty(),
        body('shippingAddress').isObject(),
        body('billingAddress').optional().isObject(),
        body('paymentToken').optional().isString()
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
                items,
                customerEmail,
                customerName,
                shippingAddress,
                billingAddress,
                notes,
                paymentToken
            } = req.body;

            // Use Firestore transaction
            const orderData = await db.runTransaction(async (transaction) => {
                // Calculate totals and validate products
                let subtotal = 0;
                const orderItems = [];

                for (const item of items) {
                    const productRef = db.collection('products').doc(item.productId);
                    const productDoc = await transaction.get(productRef);

                    if (!productDoc.exists) {
                        throw new Error(`Product ${item.productId} not found`);
                    }

                    const product = productDoc.data();

                    if (!product.isActive) {
                        throw new Error(`Product ${product.name} is not available`);
                    }

                    if (product.stockQuantity < item.quantity) {
                        throw new Error(`Insufficient stock for product ${product.name}`);
                    }

                    let itemPrice = product.price;
                    let variantName = null;

                    // Handle product variants
                    if (item.variantId && product.variants && product.variants.length > 0) {
                        const variant = product.variants.find(v => v.id === item.variantId);
                        if (variant) {
                            itemPrice = variant.price || product.price;
                            variantName = variant.name;
                            if (variant.stock < item.quantity) {
                                throw new Error(`Insufficient stock for variant ${variantName}`);
                            }
                        }
                    }

                    const itemSubtotal = itemPrice * item.quantity;
                    subtotal += itemSubtotal;

                    orderItems.push({
                        productId: item.productId,
                        productName: product.name,
                        productPrice: itemPrice,
                        quantity: item.quantity,
                        variantId: item.variantId || null,
                        variantName: variantName,
                        subtotal: itemSubtotal
                    });

                    // Update stock
                    transaction.update(productRef, {
                        stockQuantity: admin.firestore.FieldValue.increment(-item.quantity),
                        updatedAt: new Date()
                    });

                    // Update variant stock if applicable
                    if (item.variantId && product.variants) {
                        const variantIndex = product.variants.findIndex(v => v.id === item.variantId);
                        if (variantIndex >= 0) {
                            product.variants[variantIndex].stock -= item.quantity;
                            transaction.update(productRef, {
                                variants: product.variants
                            });
                        }
                    }
                }

                // Calculate tax and shipping (simplified - use real logic in production)
                const tax = subtotal * 0.1; // 10% tax
                const shipping = subtotal > 50 ? 0 : 9.99; // Free shipping over $50
                const total = subtotal + tax + shipping;

                // Create order
                const orderNumber = generateOrderNumber();
                const userId = req.user ? req.user.id : null;

                const order = {
                    userId: userId,
                    orderNumber,
                    customerEmail,
                    customerName,
                    shippingAddress,
                    billingAddress: billingAddress || shippingAddress,
                    items: orderItems,
                    subtotal,
                    tax,
                    shipping,
                    total,
                    status: 'pending',
                    paymentStatus: paymentToken ? 'pending' : 'pending',
                    paymentToken: paymentToken || null,
                    notes: notes || '',
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                const orderRef = db.collection('orders').doc();
                transaction.set(orderRef, order);

                return {
                    id: orderRef.id,
                    ...order
                };
            });

            res.status(201).json({
                message: 'Order created successfully',
                order: orderData
            });
        } catch (error) {
            console.error('Create order error:', error);
            res.status(500).json({
                error: 'ServerError',
                message: error.message || 'Failed to create order'
            });
        }
    }
);

// ===========================
// GET USER ORDERS
// ===========================
router.get('/my-orders', authenticateToken, async (req, res) => {
    try {
        const snapshot = await db.collection('orders')
            .where('userId', '==', req.user.id)
            .orderBy('createdAt', 'desc')
            .get();

        const orders = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            orders.push({
                id: doc.id,
                ...data,
                itemCount: data.items ? data.items.length : 0
            });
        });

        res.json({ orders });
    } catch (error) {
        console.error('Get user orders error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to fetch orders'
        });
    }
});

// ===========================
// GET SINGLE ORDER
// ===========================
router.get('/:orderNumber', optionalAuth, async (req, res) => {
    try {
        const { orderNumber } = req.params;

        const snapshot = await db.collection('orders')
            .where('orderNumber', '==', orderNumber)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({
                error: 'NotFound',
                message: 'Order not found'
            });
        }

        const orderDoc = snapshot.docs[0];
        const order = {
            id: orderDoc.id,
            ...orderDoc.data()
        };

        // Check authorization
        if (!req.user || (req.user.role !== 'GronderfulBlogs' && order.userId !== req.user.id)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Access denied'
            });
        }

        res.json({ order });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to fetch order'
        });
    }
});

// ===========================
// GET ALL ORDERS (Admin only)
// ===========================
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        let query = db.collection('orders');

        if (status) {
            query = query.where('status', '==', status);
        }

        query = query.orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .offset(parseInt(offset));

        const snapshot = await query.get();

        const orders = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            orders.push({
                id: doc.id,
                ...data,
                itemCount: data.items ? data.items.length : 0
            });
        });

        // Get total count
        let countQuery = db.collection('orders');
        if (status) {
            countQuery = countQuery.where('status', '==', status);
        }
        const countSnapshot = await countQuery.count().get();
        const total = countSnapshot.data().count;

        res.json({
            orders,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Get all orders error:', error);
        res.status(500).json({
            error: 'ServerError',
            message: 'Failed to fetch orders'
        });
    }
});

// ===========================
// UPDATE ORDER STATUS (Admin only)
// ===========================
router.patch('/:id/status', authenticateToken, requireAdmin,
    [
        body('status').isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
        body('paymentStatus').optional().isIn(['pending', 'paid', 'failed', 'refunded'])
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

            const { id } = req.params;
            const { status, paymentStatus } = req.body;

            const orderRef = db.collection('orders').doc(id);
            const orderDoc = await orderRef.get();

            if (!orderDoc.exists) {
                return res.status(404).json({
                    error: 'NotFound',
                    message: 'Order not found'
                });
            }

            const updates = {
                status,
                updatedAt: new Date()
            };

            if (paymentStatus) {
                updates.paymentStatus = paymentStatus;
            }

            await orderRef.update(updates);

            const updated = await orderRef.get();

            res.json({
                message: 'Order status updated successfully',
                order: {
                    id: updated.id,
                    ...updated.data()
                }
            });
        } catch (error) {
            console.error('Update order status error:', error);
            res.status(500).json({
                error: 'ServerError',
                message: 'Failed to update order status'
            });
        }
    }
);

// ===========================
// CANCEL ORDER
// ===========================
router.post('/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const orderRef = db.collection('orders').doc(id);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Order not found'
            });
        }

        const order = orderDoc.data();

        // Check authorization
        if (req.user.role !== 'GronderfulBlogs' && order.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'FORBIDDEN',
                message: 'Access denied'
            });
        }

        // Check if order can be cancelled
        if (!['pending', 'processing'].includes(order.status)) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_STATUS',
                message: `Cannot cancel order with status: ${order.status}`
            });
        }

        // Use transaction to refund stock and cancel order
        await db.runTransaction(async (transaction) => {
            // Refund stock for each item
            for (const item of order.items) {
                const productRef = db.collection('products').doc(item.productId);
                transaction.update(productRef, {
                    stockQuantity: admin.firestore.FieldValue.increment(item.quantity),
                    updatedAt: new Date()
                });
            }

            // Update order status
            transaction.update(orderRef, {
                status: 'cancelled',
                cancelledAt: new Date(),
                cancellationReason: reason || 'Cancelled by customer',
                cancelledBy: req.user.id,
                updatedAt: new Date()
            });
        });

        const updated = await orderRef.get();

        res.json({
            success: true,
            message: 'Order cancelled successfully',
            order: {
                id: updated.id,
                ...updated.data()
            }
        });
    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to cancel order'
        });
    }
});

// ===========================
// UPDATE TRACKING NUMBER (Admin only)
// ===========================
router.patch('/:id/tracking', authenticateToken, requireAdmin,
    [
        body('trackingNumber').trim().notEmpty(),
        body('carrier').optional().trim()
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
            const { trackingNumber, carrier } = req.body;

            const orderRef = db.collection('orders').doc(id);
            const orderDoc = await orderRef.get();

            if (!orderDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'NOT_FOUND',
                    message: 'Order not found'
                });
            }

            const updates = {
                trackingNumber,
                carrier: carrier || null,
                status: 'shipped',
                shippedAt: new Date(),
                updatedAt: new Date()
            };

            await orderRef.update(updates);

            const updated = await orderRef.get();

            res.json({
                success: true,
                message: 'Tracking number updated successfully',
                order: {
                    id: updated.id,
                    ...updated.data()
                }
            });
        } catch (error) {
            console.error('Update tracking error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to update tracking number'
            });
        }
    }
);

// ===========================
// ADD ORDER NOTE (Admin only)
// ===========================
router.post('/:id/notes', authenticateToken, requireAdmin,
    [
        body('note').trim().notEmpty()
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
            const { note } = req.body;

            const orderRef = db.collection('orders').doc(id);
            const orderDoc = await orderRef.get();

            if (!orderDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'NOT_FOUND',
                    message: 'Order not found'
                });
            }

            const orderNotes = orderDoc.data().orderNotes || [];
            orderNotes.push({
                note,
                addedBy: req.user.email,
                addedAt: new Date()
            });

            await orderRef.update({
                orderNotes,
                updatedAt: new Date()
            });

            const updated = await orderRef.get();

            res.json({
                success: true,
                message: 'Note added successfully',
                order: {
                    id: updated.id,
                    ...updated.data()
                }
            });
        } catch (error) {
            console.error('Add note error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to add note'
            });
        }
    }
);

// ===========================
// ORDER ANALYTICS (Admin only)
// ===========================
router.get('/admin/analytics/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = '30d' } = req.query;

        // Calculate date range
        const now = new Date();
        const days = parseInt(period) || 30;
        const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

        // Get all orders in period
        const ordersSnapshot = await db.collection('orders')
            .where('createdAt', '>=', startDate)
            .get();

        let totalOrders = 0;
        let totalRevenue = 0;
        let totalItems = 0;
        const statusCounts = {
            pending: 0,
            processing: 0,
            shipped: 0,
            delivered: 0,
            cancelled: 0
        };
        const productSales = {};

        ordersSnapshot.docs.forEach(doc => {
            const order = doc.data();
            totalOrders += 1;

            if (order.status !== 'cancelled') {
                totalRevenue += order.total || 0;
                totalItems += order.items?.length || 0;

                // Track product sales
                order.items?.forEach(item => {
                    if (!productSales[item.productId]) {
                        productSales[item.productId] = {
                            productId: item.productId,
                            productName: item.productName,
                            quantitySold: 0,
                            revenue: 0
                        };
                    }
                    productSales[item.productId].quantitySold += item.quantity;
                    productSales[item.productId].revenue += item.subtotal;
                });
            }

            statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
        });

        // Get top selling products
        const topProducts = Object.values(productSales)
            .sort((a, b) => b.quantitySold - a.quantitySold)
            .slice(0, 10);

        // Calculate average order value
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        res.json({
            success: true,
            dashboard: {
                overview: {
                    totalOrders,
                    totalRevenue: Math.round(totalRevenue * 100) / 100,
                    totalItems,
                    avgOrderValue: Math.round(avgOrderValue * 100) / 100
                },
                statusBreakdown: statusCounts,
                topProducts,
                period: `${days} days`
            }
        });
    } catch (error) {
        console.error('Order analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch order analytics'
        });
    }
});

// ===========================
// SEARCH ORDERS (Admin only)
// ===========================
router.get('/admin/search', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { q, status, dateFrom, dateTo, limit = 50 } = req.query;

        let query = db.collection('orders');

        // Filter by status
        if (status) {
            query = query.where('status', '==', status);
        }

        // Filter by date range
        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            query = query.where('createdAt', '>=', fromDate);
        }

        if (dateTo) {
            const toDate = new Date(dateTo);
            query = query.where('createdAt', '<=', toDate);
        }

        query = query.orderBy('createdAt', 'desc').limit(parseInt(limit));

        const snapshot = await query.get();
        let orders = [];

        snapshot.forEach(doc => {
            orders.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Client-side filtering for order number, customer email, customer name
        if (q) {
            const searchLower = q.toLowerCase();
            orders = orders.filter(order =>
                order.orderNumber?.toLowerCase().includes(searchLower) ||
                order.customerEmail?.toLowerCase().includes(searchLower) ||
                order.customerName?.toLowerCase().includes(searchLower)
            );
        }

        res.json({
            success: true,
            orders,
            count: orders.length
        });
    } catch (error) {
        console.error('Search orders error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to search orders'
        });
    }
});

module.exports = router;
