const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../config/firebase');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// ===========================
// GET ALL CATEGORIES (Public)
// ===========================
router.get('/', async (req, res) => {
    try {
        const {
            parent,
            includeInactive = 'false',
            sort = 'order',
            order: sortOrder = 'asc'
        } = req.query;

        let query = db.collection('categories');

        // Filter by parent category
        if (parent) {
            query = query.where('parentId', '==', parent);
        } else if (parent === null || parent === 'null') {
            query = query.where('parentId', '==', null);
        }

        // Filter active/inactive
        if (includeInactive === 'false') {
            query = query.where('isActive', '==', true);
        }

        // Apply sorting
        const validSortFields = ['order', 'name', 'createdAt'];
        const sortField = validSortFields.includes(sort) ? sort : 'order';
        const order = sortOrder.toLowerCase() === 'desc' ? 'desc' : 'asc';
        query = query.orderBy(sortField, order);

        const snapshot = await query.get();
        const categories = [];

        for (const doc of snapshot.docs) {
            const category = {
                id: doc.id,
                ...doc.data()
            };

            // Count products in this category
            const productsCount = await db.collection('products')
                .where('categoryId', '==', doc.id)
                .where('isActive', '==', true)
                .get();

            category.productCount = productsCount.size;

            // Get subcategories count
            const subcategoriesCount = await db.collection('categories')
                .where('parentId', '==', doc.id)
                .where('isActive', '==', true)
                .get();

            category.subcategoryCount = subcategoriesCount.size;

            categories.push(category);
        }

        res.json({
            success: true,
            categories
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch categories'
        });
    }
});

// ===========================
// GET CATEGORY TREE (Public)
// Hierarchical category structure
// ===========================
router.get('/tree', async (req, res) => {
    try {
        const snapshot = await db.collection('categories')
            .where('isActive', '==', true)
            .orderBy('order', 'asc')
            .get();

        const categoriesMap = new Map();
        const rootCategories = [];

        // First pass: create map of all categories
        snapshot.docs.forEach(doc => {
            const category = {
                id: doc.id,
                ...doc.data(),
                children: []
            };
            categoriesMap.set(doc.id, category);
        });

        // Second pass: build tree structure
        categoriesMap.forEach(category => {
            if (category.parentId) {
                const parent = categoriesMap.get(category.parentId);
                if (parent) {
                    parent.children.push(category);
                } else {
                    rootCategories.push(category);
                }
            } else {
                rootCategories.push(category);
            }
        });

        res.json({
            success: true,
            categories: rootCategories
        });
    } catch (error) {
        console.error('Get category tree error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch category tree'
        });
    }
});

// ===========================
// GET SINGLE CATEGORY (Public)
// ===========================
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const snapshot = await db.collection('categories')
            .where('slug', '==', slug)
            .where('isActive', '==', true)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Category not found'
            });
        }

        const categoryDoc = snapshot.docs[0];
        const category = {
            id: categoryDoc.id,
            ...categoryDoc.data()
        };

        // Get product count
        const productsCount = await db.collection('products')
            .where('categoryId', '==', categoryDoc.id)
            .where('isActive', '==', true)
            .get();

        category.productCount = productsCount.size;

        // Get subcategories
        const subcategories = await db.collection('categories')
            .where('parentId', '==', categoryDoc.id)
            .where('isActive', '==', true)
            .orderBy('order', 'asc')
            .get();

        category.subcategories = subcategories.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Get parent category if exists
        if (category.parentId) {
            const parentDoc = await db.collection('categories').doc(category.parentId).get();
            if (parentDoc.exists) {
                category.parent = {
                    id: parentDoc.id,
                    name: parentDoc.data().name,
                    slug: parentDoc.data().slug
                };
            }
        }

        res.json({
            success: true,
            category
        });
    } catch (error) {
        console.error('Get category error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to fetch category'
        });
    }
});

// ===========================
// CREATE CATEGORY (Admin only)
// ===========================
router.post('/', authenticateToken, requireAdmin,
    [
        body('name').trim().notEmpty().withMessage('Name is required'),
        body('slug').trim().notEmpty().matches(/^[a-z0-9-]+$/).withMessage('Slug must be lowercase alphanumeric with hyphens'),
        body('description').optional().trim(),
        body('parentId').optional().isString(),
        body('imageUrl').optional().isURL(),
        body('order').optional().isInt({ min: 0 })
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
                slug,
                description,
                parentId = null,
                imageUrl,
                icon,
                metadata = {},
                order = 0,
                seo = {}
            } = req.body;

            // Check if slug already exists
            const existing = await db.collection('categories')
                .where('slug', '==', slug)
                .limit(1)
                .get();

            if (!existing.empty) {
                return res.status(409).json({
                    success: false,
                    error: 'CONFLICT',
                    message: 'Category with this slug already exists'
                });
            }

            // Validate parent category exists
            if (parentId) {
                const parentDoc = await db.collection('categories').doc(parentId).get();
                if (!parentDoc.exists) {
                    return res.status(400).json({
                        success: false,
                        error: 'VALIDATION_ERROR',
                        message: 'Parent category not found'
                    });
                }
            }

            // Create category
            const categoryData = {
                name,
                slug,
                description: description || '',
                parentId,
                imageUrl: imageUrl || null,
                icon: icon || '',
                metadata,
                order,
                seo: {
                    metaTitle: seo.metaTitle || name,
                    metaDescription: seo.metaDescription || description || '',
                    keywords: seo.keywords || []
                },
                isActive: true,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('categories').add(categoryData);

            res.status(201).json({
                success: true,
                message: 'Category created successfully',
                category: {
                    id: docRef.id,
                    ...categoryData
                }
            });
        } catch (error) {
            console.error('Create category error:', error);
            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Failed to create category'
            });
        }
    }
);

// ===========================
// UPDATE CATEGORY (Admin only)
// ===========================
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if category exists
        const categoryRef = db.collection('categories').doc(id);
        const categoryDoc = await categoryRef.get();

        if (!categoryDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Category not found'
            });
        }

        // Build update data
        const allowedFields = [
            'name', 'slug', 'description', 'parentId', 'imageUrl',
            'icon', 'metadata', 'order', 'seo', 'isActive'
        ];

        const updates = {};
        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                updates[key] = req.body[key];
            }
        });

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'No valid fields to update'
            });
        }

        // Validate slug uniqueness if being updated
        if (updates.slug && updates.slug !== categoryDoc.data().slug) {
            const existing = await db.collection('categories')
                .where('slug', '==', updates.slug)
                .limit(1)
                .get();

            if (!existing.empty) {
                return res.status(409).json({
                    success: false,
                    error: 'CONFLICT',
                    message: 'Category with this slug already exists'
                });
            }
        }

        // Prevent circular parent relationship
        if (updates.parentId) {
            if (updates.parentId === id) {
                return res.status(400).json({
                    success: false,
                    error: 'VALIDATION_ERROR',
                    message: 'Category cannot be its own parent'
                });
            }

            // Check if new parent is a descendant
            const isDescendant = await checkIfDescendant(id, updates.parentId);
            if (isDescendant) {
                return res.status(400).json({
                    success: false,
                    error: 'VALIDATION_ERROR',
                    message: 'Cannot set a descendant category as parent'
                });
            }
        }

        updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

        // Update category
        await categoryRef.update(updates);

        const updated = await categoryRef.get();

        res.json({
            success: true,
            message: 'Category updated successfully',
            category: {
                id: updated.id,
                ...updated.data()
            }
        });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to update category'
        });
    }
});

// ===========================
// DELETE CATEGORY (Admin only)
// Soft delete - set isActive to false
// ===========================
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { force = 'false' } = req.query;

        const categoryRef = db.collection('categories').doc(id);
        const categoryDoc = await categoryRef.get();

        if (!categoryDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Category not found'
            });
        }

        // Check for subcategories
        const subcategories = await db.collection('categories')
            .where('parentId', '==', id)
            .where('isActive', '==', true)
            .get();

        if (!subcategories.empty && force === 'false') {
            return res.status(400).json({
                success: false,
                error: 'HAS_SUBCATEGORIES',
                message: 'Cannot delete category with active subcategories. Use force=true to delete all.',
                subcategoryCount: subcategories.size
            });
        }

        // Check for products
        const products = await db.collection('products')
            .where('categoryId', '==', id)
            .where('isActive', '==', true)
            .get();

        if (!products.empty && force === 'false') {
            return res.status(400).json({
                success: false,
                error: 'HAS_PRODUCTS',
                message: 'Cannot delete category with active products. Use force=true or reassign products.',
                productCount: products.size
            });
        }

        // Soft delete category
        await categoryRef.update({
            isActive: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // If force delete, also soft delete subcategories and unassign products
        if (force === 'true') {
            const batch = db.batch();

            // Delete subcategories
            subcategories.docs.forEach(doc => {
                batch.update(doc.ref, {
                    isActive: false,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });

            // Unassign products (set categoryId to null)
            products.docs.forEach(doc => {
                batch.update(doc.ref, {
                    categoryId: null,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });

            await batch.commit();
        }

        res.json({
            success: true,
            message: 'Category deleted successfully',
            deletedSubcategories: force === 'true' ? subcategories.size : 0,
            reassignedProducts: force === 'true' ? products.size : 0
        });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to delete category'
        });
    }
});

// ===========================
// BULK REORDER CATEGORIES (Admin only)
// ===========================
router.post('/bulk/reorder', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { categories } = req.body;

        if (!Array.isArray(categories) || categories.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'categories must be a non-empty array of {id, order}'
            });
        }

        const batch = db.batch();
        const updatedAt = admin.firestore.FieldValue.serverTimestamp();

        for (const cat of categories) {
            if (!cat.id || typeof cat.order !== 'number') {
                return res.status(400).json({
                    success: false,
                    error: 'VALIDATION_ERROR',
                    message: 'Each category must have id and order'
                });
            }

            const categoryRef = db.collection('categories').doc(cat.id);
            batch.update(categoryRef, { order: cat.order, updatedAt });
        }

        await batch.commit();

        res.json({
            success: true,
            message: `${categories.length} categories reordered successfully`
        });
    } catch (error) {
        console.error('Bulk reorder error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Failed to reorder categories'
        });
    }
});

// ===========================
// HELPER FUNCTIONS
// ===========================

// Check if categoryId is a descendant of potentialParentId
async function checkIfDescendant(categoryId, potentialParentId) {
    let currentId = potentialParentId;

    while (currentId) {
        if (currentId === categoryId) {
            return true;
        }

        const doc = await db.collection('categories').doc(currentId).get();
        if (!doc.exists) {
            break;
        }

        currentId = doc.data().parentId;
    }

    return false;
}

module.exports = router;
