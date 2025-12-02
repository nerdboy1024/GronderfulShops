// ===========================
// GronderfulBlogs - ADMIN PANEL
// Complete Admin Panel with Firebase
// ===========================

// Import Firebase modules
import { auth, db, storage } from '/firebase-config.js';
import {
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    getDoc,
    setDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
    ref,
    uploadBytes,
    getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// ===========================
// CONFIGURATION
// ===========================

const CONFIG = {
    // API endpoints
    API_URL: window.location.hostname === 'localhost' ? 'http://localhost:5000' : '',
    // PHP Upload endpoint - works both locally and in production
    UPLOAD_URL: window.location.hostname === 'localhost' ? 'http://localhost:8081/api/upload.php' : '/api/upload.php',
    ITEMS_PER_PAGE: 20
};

// ===========================
// STATE MANAGEMENT
// ===========================

const state = {
    currentUser: null,
    currentPage: 'dashboard',
    products: [],
    categories: [],
    blogPosts: [],
    orders: [],
    selectedItem: null,
    filters: {
        products: { category: 'all', search: '' },
        blog: { status: 'all', search: '' },
        orders: { status: 'all', search: '' }
    }
};

// ===========================
// AUTHENTICATION
// ===========================

// Login function
async function login(email, password) {
    try {
        showLoading();
        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        // Check if user is admin
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'GronderfulBlogs') {
            await signOut(auth);
            throw new Error('Access denied. Admin privileges required.');
        }

        hideLoading();
        showNotification('Welcome back!', 'success');
    } catch (error) {
        hideLoading();
        console.error('Login error:', error);
        showNotification(error.message, 'error');
        throw error;
    }
}

// Logout function
async function logout() {
    try {
        await signOut(auth);
        showNotification('Logged out successfully', 'success');
        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Failed to logout', 'error');
    }
}

// Auth state observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Check if user is admin
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && userDoc.data().role === 'GronderfulBlogs') {
            state.currentUser = {
                uid: user.uid,
                email: user.email,
                ...userDoc.data()
            };
            showDashboard();
            initializeAdmin();
        } else {
            await signOut(auth);
            showLogin();
        }
    } else {
        showLogin();
    }
});

// ===========================
// UI MANAGEMENT
// ===========================

function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminDashboard').style.display = 'none';
}

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'flex';

    // Update user info
    document.getElementById('userEmail').textContent = state.currentUser.email;

    // Set user role on body for role-based visibility
    if (state.currentUser && state.currentUser.role) {
        document.body.setAttribute('data-user-role', state.currentUser.role);
    }
}

function navigateTo(pageName) {
    // Check if page requires admin role
    const navItem = document.querySelector(`[data-section="${pageName}"]`);
    const requiredRole = navItem?.getAttribute('data-role-required');

    if (requiredRole && state.currentUser?.role !== requiredRole) {
        showNotification('Access denied. Admin privileges required.', 'error');
        navigateTo('dashboard'); // Redirect to dashboard
        return;
    }

    state.currentPage = pageName;

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${pageName}"]`)?.classList.add('active');

    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Show selected section
    const sectionElement = document.getElementById(`${pageName}Section`);
    if (sectionElement) {
        sectionElement.classList.add('active');
    }

    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        products: 'Products',
        blog: 'Blog Posts',
        categories: 'Categories',
        orders: 'Orders',
        users: 'User Management',
        segments: 'User Segments',
        media: 'Media Library',
        vendors: 'Vendors',
        baseProducts: 'Base Products',
        siteIdentity: 'Site Identity',
        templates: 'Templates',
        modules: 'Modules'
    };
    document.getElementById('pageTitle').textContent = titles[pageName] || pageName;

    // Load page data
    loadPageData(pageName);
}

async function loadPageData(pageName) {
    try {
        showLoading();

        switch(pageName) {
            case 'dashboard':
                await loadDashboardData();
                break;
            case 'products':
                await loadProducts();
                break;
            case 'blog':
                await loadBlogPosts();
                break;
            case 'categories':
                await loadCategories();
                break;
            case 'orders':
                await loadOrders();
                break;
            case 'users':
                if (typeof loadUsers === 'function') await loadUsers();
                break;
            case 'segments':
                if (typeof loadSegments === 'function') await loadSegments();
                break;
            case 'media':
                await loadMedia();
                break;
            case 'vendors':
                if (typeof loadVendors === 'function') await loadVendors();
                break;
            case 'baseProducts':
                if (typeof loadBaseProducts === 'function') await loadBaseProducts();
                break;
            case 'siteIdentity':
                await loadSiteIdentity();
                break;
            case 'templates':
                await loadTemplates();
                break;
            case 'modules':
                await loadModules();
                break;
        }

        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading page data:', error);
        showNotification('Failed to load data', 'error');
    }
}

// ===========================
// DASHBOARD
// ===========================

async function loadDashboardData() {
    try {
        // Get counts
        const productsSnap = await getDocs(collection(db, 'products'));
        const activeProducts = productsSnap.docs.filter(doc => doc.data().isActive).length;

        const blogSnap = await getDocs(collection(db, 'blog'));
        const publishedPosts = blogSnap.docs.filter(doc => doc.data().isPublished).length;

        const ordersSnap = await getDocs(collection(db, 'orders'));
        const totalOrders = ordersSnap.size;

        // Calculate revenue (placeholder)
        let totalRevenue = 0;
        ordersSnap.forEach(doc => {
            const order = doc.data();
            if (order.paymentStatus === 'paid') {
                totalRevenue += order.total || 0;
            }
        });

        // Update stats
        document.getElementById('statOrders').textContent = totalOrders;
        document.getElementById('statRevenue').textContent = `$${totalRevenue.toFixed(2)}`;
        document.getElementById('statProducts').textContent = activeProducts;
        document.getElementById('statPosts').textContent = publishedPosts;

        // Load recent orders
        const recentOrdersQuery = query(
            collection(db, 'orders'),
            orderBy('createdAt', 'desc'),
            limit(5)
        );
        const recentOrdersSnap = await getDocs(recentOrdersQuery);

        const recentOrdersHTML = recentOrdersSnap.docs.map(doc => {
            const order = doc.data();
            return `
                <div class="widget-item">
                    <div>
                        <strong>${order.orderNumber}</strong> - ${order.customerName}
                        <br>
                        <small>${new Date(order.createdAt?.toDate()).toLocaleDateString()}</small>
                    </div>
                    <div>
                        <span class="table-badge badge-${order.status}">${order.status}</span>
                        <strong>$${order.total?.toFixed(2)}</strong>
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('recentOrders').innerHTML = recentOrdersHTML || '<p class="text-center text-muted">No orders yet</p>';

        // Low stock alert (placeholder)
        const lowStockProducts = productsSnap.docs.filter(doc => {
            const data = doc.data();
            return data.isActive && (data.stockQuantity || 0) < 5;
        });

        const lowStockHTML = lowStockProducts.map(doc => {
            const product = doc.data();
            return `
                <div class="widget-item">
                    <div>${product.name}</div>
                    <span class="table-badge badge-warning">${product.stockQuantity} left</span>
                </div>
            `;
        }).join('');

        document.getElementById('lowStock').innerHTML = lowStockHTML || '<p class="text-center text-muted">All products in stock</p>';

    } catch (error) {
        console.error('Error loading dashboard:', error);
        throw error;
    }
}

// ===========================
// PRODUCTS MANAGEMENT
// ===========================

async function loadProducts() {
    try {
        let q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));

        const snapshot = await getDocs(q);
        state.products = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderProductsTable();
    } catch (error) {
        console.error('Error loading products:', error);
        throw error;
    }
}

function renderProductsTable() {
    const filteredProducts = state.products.filter(product => {
        // Filter out deleted products (isActive: false)
        const isActive = product.isActive !== false;
        const matchesCategory = state.filters.products.category === 'all' ||
                                product.categoryId === state.filters.products.category;
        const matchesSearch = !state.filters.products.search ||
                             product.name.toLowerCase().includes(state.filters.products.search.toLowerCase());
        return isActive && matchesCategory && matchesSearch;
    });

    const tableHTML = `
        <div class="table-container">
            <div class="table-header">
                <div class="table-search">
                    <input type="text" placeholder="Search products..." id="productSearch">
                    <select id="productCategoryFilter">
                        <option value="all">All Categories</option>
                        ${state.categories.map(cat => `
                            <option value="${cat.id}">${cat.name}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="table-actions">
                    <button class="btn btn-secondary" onclick="window.adminApp.syncPrintfulProducts()" style="margin-right: 0.5rem;">
                        Sync Printful Products
                    </button>
                    <button class="btn btn-primary" onclick="window.adminApp.showProductForm()">
                        Add Product
                    </button>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Image</th>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Price</th>
                        <th>Stock</th>
                        <th>Variants</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredProducts.length === 0 ? `
                        <tr>
                            <td colspan="8">
                                <div class="empty-state">
                                    <div class="empty-state-icon">🔮</div>
                                    <div class="empty-state-text">No products found</div>
                                </div>
                            </td>
                        </tr>
                    ` : filteredProducts.map(product => `
                        <tr>
                            <td>
                                <img src="${product.imageUrl || 'https://via.placeholder.com/50'}"
                                     alt="${product.name}"
                                     class="table-thumbnail">
                            </td>
                            <td>${product.name}</td>
                            <td>${product.categories ? product.categories.join(', ') : getCategoryName(product.categoryId)}</td>
                            <td>$${product.price?.toFixed(2)}</td>
                            <td>${product.stockQuantity || 0}</td>
                            <td>
                                ${product.hasVariants && product.variants?.length > 0
                                    ? `<span style="color: #8b5cf6;">${product.variants.length} variant${product.variants.length !== 1 ? 's' : ''}</span>`
                                    : '<span style="color: #666;">—</span>'}
                            </td>
                            <td>
                                <span class="table-badge badge-${product.isActive ? 'active' : 'inactive'}">
                                    ${product.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td class="table-actions-cell">
                                <button class="btn btn-icon btn-secondary"
                                        onclick="window.adminApp.editProduct('${product.id}')"
                                        title="Edit">
                                    ✏️
                                </button>
                                <button class="btn btn-icon btn-danger"
                                        onclick="window.adminApp.deleteProduct('${product.id}')"
                                        title="Delete">
                                    🗑️
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('productsTable').innerHTML = tableHTML;

    // Add event listeners
    document.getElementById('productSearch')?.addEventListener('input', (e) => {
        state.filters.products.search = e.target.value;
        renderProductsTable();
    });

    document.getElementById('productCategoryFilter')?.addEventListener('change', (e) => {
        state.filters.products.category = e.target.value;
        renderProductsTable();
    });
}

async function showProductForm(productId = null) {
    console.log('[DEBUG showProductForm] productId:', productId);
    console.log('[DEBUG showProductForm] state.categories.length:', state.categories.length);

    // Ensure categories are loaded before showing form
    if (state.categories.length === 0) {
        console.log('[DEBUG] Categories not loaded, loading now...');
        await loadCategories();
        console.log('[DEBUG] Categories after load:', state.categories.length, state.categories);
    } else {
        console.log('[DEBUG] Categories already loaded:', state.categories.length, state.categories);
    }

    const product = productId ? state.products.find(p => p.id === productId) : null;

    console.log('[DEBUG] About to create modal HTML, state.categories.length:', state.categories.length);
    console.log('[DEBUG showProductForm] Found product:', product);
    console.log('[DEBUG showProductForm] Product name:', product?.name);
    const isEdit = !!product;

    const modalHTML = `
        <div class="modal-header">
            <h2>${isEdit ? 'Edit Product' : 'Add New Product'}</h2>
            <button class="modal-close" onclick="window.adminApp.closeModal()">&times;</button>
        </div>
        <div class="modal-body">
            <form id="productForm" class="form-grid">
                <div class="form-group">
                    <label>Product Name *</label>
                    <input type="text" id="productName" value="${product?.name || ''}" required>
                </div>

                <div class="form-group">
                    <label>Categories * <small>(Select one or more)</small></label>
                    <div class="category-checkboxes" id="productCategories" style="max-height: 200px; overflow-y: auto; border: 1px solid #444; padding: 10px; border-radius: 4px;">
                        ${state.categories.map(cat => {
                            const isChecked = product?.categories?.includes(cat.name) || product?.categoryId === cat.id;
                            return `
                                <label style="display: block; margin-bottom: 8px; cursor: pointer;">
                                    <input type="checkbox" name="productCategory" value="${cat.name}" ${isChecked ? 'checked' : ''} style="margin-right: 8px;">
                                    ${cat.icon || '🏷️'} ${cat.name}
                                </label>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div class="form-group">
                    <label>Price *</label>
                    <input type="number" id="productPrice" step="0.01" value="${product?.price || ''}" required>
                </div>

                <div class="form-group">
                    <label>Compare At Price</label>
                    <input type="number" id="productComparePrice" step="0.01" value="${product?.compareAtPrice || ''}">
                </div>

                <div class="form-group">
                    <label>Stock Quantity *</label>
                    <input type="number" id="productStock" value="${product?.stockQuantity || 0}" required>
                </div>

                <div class="form-group">
                    <label>Slug</label>
                    <input type="text" id="productSlug" value="${product?.slug || ''}">
                </div>

                <div class="form-group form-group-full">
                    <label>Description</label>
                    <textarea id="productDescription" rows="4">${product?.description || ''}</textarea>
                </div>

                <div class="form-group form-group-full">
                    <label>Product Images</label>
                    <div class="image-upload-zone" id="productImageUpload" onclick="document.getElementById('productImageInput').click(); console.log('[INLINE] Upload zone clicked');">
                        <div class="image-upload-icon">📷</div>
                        <div class="image-upload-text">Drag & drop images here or click to browse</div>
                        <div class="image-upload-hint">Supports: JPG, PNG, WebP (max 5MB each)</div>
                    </div>
                    <input type="file" id="productImageInput" class="image-upload-input" multiple accept="image/*">
                    <div id="productImageGallery" class="image-gallery">
                        ${(product?.images || []).map((img, index) => `
                            <div class="gallery-item" data-url="${img}">
                                <img src="${img}" alt="Product image">
                                ${index === 0 ? '<span class="gallery-item-badge">Main</span>' : ''}
                                <button type="button" class="gallery-item-remove" data-image-url="${img}">×</button>
                            </div>
                        `).join('')}
                    </div>
                    <div id="productUploadProgress" class="upload-progress"></div>
                </div>

                <div class="form-group form-group-full">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <label>Product Variants <small>(Optional - for size/color variations)</small></label>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="window.adminApp.addVariant()">+ Add Variant</button>
                    </div>
                    <div id="variantsContainer" style="border: 1px solid #444; padding: 15px; border-radius: 4px; min-height: 60px;">
                        ${product?.variants && product.variants.length > 0 ? product.variants.map((variant, index) => `
                            <div class="variant-row" data-variant-index="${index}" style="background: #2a2a2a; padding: 15px; margin-bottom: 10px; border-radius: 4px; position: relative;">
                                <button type="button" class="btn btn-sm btn-danger" onclick="window.adminApp.removeVariant(${index})" style="position: absolute; top: 10px; right: 10px;">×</button>

                                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                                    <div>
                                        <label style="font-size: 12px; color: #aaa;">SKU *</label>
                                        <input type="text" class="form-input variant-sku" value="${variant.sku || ''}" placeholder="BTN-BLK-10" required style="font-size: 14px;">
                                    </div>
                                    <div>
                                        <label style="font-size: 12px; color: #aaa;">Price *</label>
                                        <input type="number" class="form-input variant-price" value="${variant.price || ''}" step="0.01" required style="font-size: 14px;">
                                    </div>
                                    <div>
                                        <label style="font-size: 12px; color: #aaa;">Stock *</label>
                                        <input type="number" class="form-input variant-stock" value="${variant.stock || 0}" required style="font-size: 14px;">
                                    </div>
                                </div>

                                <div>
                                    <label style="font-size: 12px; color: #aaa;">Attributes (e.g., Color: Black, Size: 10mm)</label>
                                    <div class="variant-attributes" style="display: flex; gap: 10px; flex-wrap: wrap;">
                                        ${Object.entries(variant.attributes || {}).map(([key, value]) => `
                                            <div class="attribute-tag" style="background: #444; padding: 5px 10px; border-radius: 4px; display: flex; align-items: center; gap: 5px;">
                                                <span style="font-size: 12px;">${key}: ${value}</span>
                                                <button type="button" onclick="this.parentElement.remove()" style="background: none; border: none; color: #ff4444; cursor: pointer; font-size: 14px; padding: 0;">×</button>
                                            </div>
                                        `).join('')}
                                        <button type="button" class="btn btn-sm" onclick="window.adminApp.addAttribute(${index})" style="font-size: 12px; padding: 5px 10px;">+ Add Attribute</button>
                                    </div>
                                </div>
                            </div>
                        `).join('') : '<div style="color: #888; text-align: center; padding: 20px;">No variants. Click "+ Add Variant" to create size/color options.</div>'}
                    </div>
                </div>

                <div class="form-group form-group-full admin-only">
                    <label>📦 Base Products (Inventory Tracking) <em style="color: #888;">(Optional)</em></label>
                    <small>Link raw materials/components used to make this product. Leave empty if no inventory tracking is needed.</small>

                    <div class="base-products-section" style="margin-top: 10px;">
                        <div class="base-product-selector" style="display: flex; gap: 10px; align-items: center; margin-bottom: 15px;">
                            <select id="productBaseProductSelect" class="form-select" style="flex: 1;">
                                <option value="">Select a base product...</option>
                            </select>
                            <input type="number" id="productBaseProductQty" class="form-input" min="1" placeholder="Qty" style="width: 80px;">
                            <button type="button" id="addProductBaseProductBtn" class="btn btn-secondary btn-sm">
                                + Add
                            </button>
                        </div>

                        <div id="productBaseProductsList" class="product-base-products-list" style="border: 1px solid #444; border-radius: 4px; min-height: 60px; padding: 10px;">
                            <!-- Selected base products will appear here -->
                        </div>
                    </div>
                </div>

                <div class="form-group-inline">
                    <input type="checkbox" id="productActive" ${product?.isActive !== false ? 'checked' : ''}>
                    <label for="productActive">Active</label>
                </div>

                <div class="form-group-inline">
                    <input type="checkbox" id="productFeatured" ${product?.isFeatured ? 'checked' : ''}>
                    <label for="productFeatured">Featured</label>
                </div>
            </form>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="window.adminApp.closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="window.adminApp.saveProduct('${productId || ''}')">
                ${isEdit ? 'Update' : 'Create'} Product
            </button>
        </div>
    `;

    showModal(modalHTML);

    // Defer initialization to ensure DOM is fully ready
    setTimeout(() => {
        // Populate category dropdown with JavaScript to ensure categories are loaded
        const categorySelect = document.getElementById('productCategory');
        // Clear existing options except placeholder
        categorySelect.innerHTML = '<option value="">Select Category</option>';

        // Add category options
        state.categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            categorySelect.appendChild(option);
        });

        console.log('[DEBUG] Category options populated:', state.categories.length);

        // Set form values via JavaScript instead of relying on template string
        if (product) {
            console.log('[DEBUG] Setting form values for product:', product);
            document.getElementById('productName').value = product.name || '';

            // Set category
            categorySelect.value = product.categoryId || '';
            console.log('[DEBUG] Category set to:', categorySelect.value);

            document.getElementById('productPrice').value = product.price || '';
            document.getElementById('productComparePrice').value = product.compareAtPrice || '';
            document.getElementById('productStock').value = product.stockQuantity || 0;
            document.getElementById('productSlug').value = product.slug || '';
            document.getElementById('productDescription').value = product.description || '';
            document.getElementById('productActive').checked = product.isActive !== false;
            document.getElementById('productFeatured').checked = product.isFeatured || false;
        }

        initializeImageUpload('product', product?.images || []);

        // Attach delete handlers to existing product images
        document.querySelectorAll('#productImageGallery .gallery-item-remove').forEach(btn => {
            btn.addEventListener('click', function() {
                console.log('[DEBUG] Delete button clicked');
                this.parentElement.remove();
            });
        });

        // Initialize base products module
        console.log('[ADMIN] Checking for base products module...');
        if (typeof window.initProductBaseProducts === 'function') {
            console.log('[ADMIN] Initializing base products module...');
            // Use another setTimeout to ensure this runs AFTER the current timeout completes
            setTimeout(async () => {
                await window.initProductBaseProducts();

                // Load existing base products if editing
                if (product && typeof window.loadProductBaseProducts === 'function') {
                    console.log('[ADMIN] Loading existing base products for product:', product.id);
                    window.loadProductBaseProducts(product.baseProducts || null);
                } else if (typeof window.clearSelectedBaseProducts === 'function') {
                    console.log('[ADMIN] Clearing base products for new product');
                    window.clearSelectedBaseProducts();
                }
            }, 100); // Small delay to ensure DOM is ready
        } else {
            console.warn('[ADMIN] Base products module not found - window.initProductBaseProducts is', typeof window.initProductBaseProducts);
        }

        // DEBUG: Verify values are set
        const checkEl = document.getElementById('productName');
        console.log('[DEBUG showProductForm AFTER SET] Input value:', checkEl?.value);
    }, 0);
}

async function saveProduct(productId) {
    try {
        // Debug: Check if elements exist
        const nameEl = document.getElementById('productName');
        console.log('[DEBUG saveProduct] Product name element:', nameEl);
        console.log('[DEBUG saveProduct] Product name value:', nameEl?.value);

        const name = document.getElementById('productName')?.value || '';

        // Get selected categories from checkboxes
        const categoryCheckboxes = document.querySelectorAll('input[name="productCategory"]:checked');
        const categories = Array.from(categoryCheckboxes).map(cb => cb.value);

        const price = parseFloat(document.getElementById('productPrice')?.value || '0');
        const compareAtPrice = document.getElementById('productComparePrice')?.value || '';
        const stockQuantity = parseInt(document.getElementById('productStock')?.value || '0');
        const slug = document.getElementById('productSlug')?.value || generateSlug(name);
        const description = document.getElementById('productDescription')?.value || '';
        const isActive = document.getElementById('productActive')?.checked || false;
        const isFeatured = document.getElementById('productFeatured')?.checked || false;

        console.log('[DEBUG saveProduct] Form values:', { name, categories, price, stockQuantity });

        // Validate required fields with specific error messages
        if (!name || name.trim() === '') {
            console.log('[DEBUG saveProduct] Validation FAILED: name is empty');
            showNotification('Product name is required', 'error');
            return;
        }
        if (categories.length === 0) {
            showNotification('Please select at least one category', 'error');
            return;
        }
        if (!price || isNaN(price)) {
            showNotification('Please enter a valid price', 'error');
            return;
        }
        if (isNaN(stockQuantity) || stockQuantity < 0) {
            showNotification('Please enter a valid stock quantity (0 or greater)', 'error');
            return;
        }

        // Get uploaded images
        const imageElements = document.querySelectorAll('#productImageGallery .gallery-item');
        const images = Array.from(imageElements).map(el => el.dataset.url);
        const imageUrl = images[0] || '';

        // Collect variants from form
        const variantRows = document.querySelectorAll('.variant-row');
        const variants = Array.from(variantRows).map((row, index) => {
            const sku = row.querySelector('.variant-sku')?.value?.trim();
            const variantPrice = parseFloat(row.querySelector('.variant-price')?.value);
            const variantStock = parseInt(row.querySelector('.variant-stock')?.value);

            // Validate variant data
            if (!sku) {
                throw new Error(`Variant ${index + 1}: SKU is required`);
            }
            if (!variantPrice || isNaN(variantPrice)) {
                throw new Error(`Variant ${index + 1}: Valid price is required`);
            }
            if (isNaN(variantStock) || variantStock < 0) {
                throw new Error(`Variant ${index + 1}: Valid stock quantity is required`);
            }

            // Collect attributes from tags
            const attributeTags = row.querySelectorAll('.attribute-tag');
            const attributes = {};
            attributeTags.forEach(tag => {
                const key = tag.dataset.key;
                const value = tag.dataset.value;
                if (key && value) {
                    attributes[key] = value;
                }
            });

            return {
                id: `variant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                sku,
                price: variantPrice,
                stock: variantStock,
                attributes,
                images: [], // Can add variant-specific images later
                isActive: true
            };
        });

        // Get base products data from the base products module
        let baseProducts = null;
        if (typeof window.getSelectedBaseProducts === 'function') {
            baseProducts = window.getSelectedBaseProducts(); // Returns null if none selected
        }

        const productData = {
            name,
            slug,
            categories, // Array of category names
            description,
            price,
            compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
            stockQuantity,
            imageUrl,
            images,
            isActive,
            isFeatured,
            hasVariants: variants.length > 0,
            variants: variants,
            baseProducts: baseProducts, // null if no inventory tracking, array if tracking
            updatedAt: serverTimestamp()
        };

        if (productId) {
            // Update existing product
            await updateDoc(doc(db, 'products', productId), productData);
            showNotification('Product updated successfully', 'success');
        } else {
            // Create new product
            productData.createdAt = serverTimestamp();
            await addDoc(collection(db, 'products'), productData);
            showNotification('Product created successfully', 'success');
        }

        closeModal();
        await loadProducts();

    } catch (error) {
        console.error('Error saving product:', error);
        showNotification('Failed to save product', 'error');
    }
}

async function deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
        showLoading();

        // Soft delete - set isActive to false
        await updateDoc(doc(db, 'products', productId), {
            isActive: false,
            updatedAt: serverTimestamp()
        });

        hideLoading();
        showNotification('Product deleted successfully', 'success');
        await loadProducts();

    } catch (error) {
        hideLoading();
        console.error('Error deleting product:', error);
        showNotification('Failed to delete product', 'error');
    }
}

// ===========================
// BLOG MANAGEMENT
// ===========================

async function loadBlogPosts() {
    try {
        const q = query(collection(db, 'blog'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        state.blogPosts = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderBlogTable();
    } catch (error) {
        console.error('Error loading blog posts:', error);
        throw error;
    }
}

function renderBlogTable() {
    const filteredPosts = state.blogPosts.filter(post => {
        const matchesStatus = state.filters.blog.status === 'all' ||
                             (state.filters.blog.status === 'published' ? post.isPublished : !post.isPublished);
        const matchesSearch = !state.filters.blog.search ||
                             post.title.toLowerCase().includes(state.filters.blog.search.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    const tableHTML = `
        <div class="table-container">
            <div class="table-header">
                <div class="table-search">
                    <input type="text" placeholder="Search blog posts..." id="blogSearch">
                    <select id="blogStatusFilter">
                        <option value="all">All Posts</option>
                        <option value="published">Published</option>
                        <option value="draft">Drafts</option>
                    </select>
                </div>
                <div class="table-actions">
                    <button class="btn btn-primary" onclick="window.adminApp.showBlogForm()">
                        Add Blog Post
                    </button>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Image</th>
                        <th>Title</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredPosts.length === 0 ? `
                        <tr>
                            <td colspan="6">
                                <div class="empty-state">
                                    <div class="empty-state-icon">📝</div>
                                    <div class="empty-state-text">No blog posts found</div>
                                </div>
                            </td>
                        </tr>
                    ` : filteredPosts.map(post => `
                        <tr>
                            <td>
                                <img src="${post.featuredImage || 'https://via.placeholder.com/50'}"
                                     alt="${post.title}"
                                     class="table-thumbnail">
                            </td>
                            <td>${post.title}</td>
                            <td>${post.category || 'Uncategorized'}</td>
                            <td>
                                <span class="table-badge badge-${post.isPublished ? 'published' : 'draft'}">
                                    ${post.isPublished ? 'Published' : 'Draft'}
                                </span>
                            </td>
                            <td>${post.publishedAt ? new Date(post.publishedAt.toDate()).toLocaleDateString() : 'Not published'}</td>
                            <td class="table-actions-cell">
                                <button class="btn btn-icon btn-secondary"
                                        onclick="window.adminApp.editBlogPost('${post.id}')"
                                        title="Edit">
                                    ✏️
                                </button>
                                <button class="btn btn-icon btn-danger"
                                        onclick="window.adminApp.deleteBlogPost('${post.id}')"
                                        title="Delete">
                                    🗑️
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('blogTable').innerHTML = tableHTML;

    // Event listeners
    document.getElementById('blogSearch')?.addEventListener('input', (e) => {
        state.filters.blog.search = e.target.value;
        renderBlogTable();
    });

    document.getElementById('blogStatusFilter')?.addEventListener('change', (e) => {
        state.filters.blog.status = e.target.value;
        renderBlogTable();
    });
}

function showBlogForm(postId = null) {
    const post = postId ? state.blogPosts.find(p => p.id === postId) : null;
    const isEdit = !!post;

    console.log('[DEBUG showBlogForm] Post ID:', postId, 'Is Edit:', isEdit);

    // Use the static blogModal from HTML
    const modal = document.getElementById('blogModal');
    const modalTitle = document.getElementById('blogModalTitle');

    // Set modal title
    modalTitle.textContent = isEdit ? 'Edit Blog Post' : 'Add New Blog Post';

    // Update button text
    const saveButton = modal.querySelector('button[type="submit"]');
    if (saveButton) {
        saveButton.textContent = isEdit ? 'Update Post' : 'Save Post';
    }

    // Store postId for save function
    state.selectedItem = postId;

    // Clear and populate form fields
    document.getElementById('blogId').value = postId || '';
    document.getElementById('blogTitle').value = post?.title || '';
    document.getElementById('blogSlug').value = post?.slug || '';
    document.getElementById('blogExcerpt').value = post?.excerpt || '';
    document.getElementById('blogCategory').value = post?.category || '';
    document.getElementById('blogTags').value = post?.tags?.join(', ') || '';
    document.getElementById('blogAuthor').value = post?.authorName || 'Admin';
    document.getElementById('blogPublished').checked = post?.isPublished || false;

    // Clear and set featured image
    const imageGallery = document.getElementById('blogImageGallery');
    imageGallery.innerHTML = '';
    if (post?.featuredImage) {
        imageGallery.innerHTML = `
            <div class="gallery-item">
                <img src="${post.featuredImage}" alt="Featured image">
                <button type="button" class="gallery-item-remove" onclick="this.parentElement.remove()">×</button>
            </div>
        `;
    }

    // Populate SEO fields
    const seo = post?.seo || {};
    document.getElementById('blogMetaTitle').value = seo.metaTitle || '';
    document.getElementById('blogMetaDescription').value = seo.metaDescription || '';
    document.getElementById('blogFocusKeyword').value = seo.focusKeyword || '';
    document.getElementById('blogCanonicalUrl').value = seo.canonicalUrl || '';
    document.getElementById('blogOgImage').value = seo.ogImage || '';
    document.getElementById('blogNoIndex').checked = seo.noIndex || false;

    // Initialize Quill editor with content
    initializeQuillEditor(post?.content || '');

    // Show the modal
    modal.classList.add('active');

    console.log('[DEBUG] Blog modal shown with values populated');
}

async function saveBlogPost(postId) {
    try {
        // Use stored postId from state if not provided
        if (!postId) postId = state.selectedItem;

        const title = document.getElementById('blogTitle').value;
        const slug = document.getElementById('blogSlug').value || generateSlug(title);
        const excerpt = document.getElementById('blogExcerpt').value;
        const category = document.getElementById('blogCategory').value;
        const tagsInput = document.getElementById('blogTags').value;
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
        const isPublished = document.getElementById('blogPublished').checked;

        // Get featured image from gallery
        const imageGallery = document.getElementById('blogImageGallery');
        const imageEl = imageGallery.querySelector('img');
        const featuredImage = imageEl ? imageEl.src : '';

        // Get content from Quill editor with better error handling
        let content = '';
        if (window.quillEditor) {
            content = window.quillEditor.root.innerHTML;
            // Clean up empty Quill content
            if (content === '<p><br></p>' || content === '<p></p>') {
                content = '';
            }
        } else {
            console.error('Quill editor not initialized');
            showNotification('Editor not initialized. Please try again.', 'error');
            return;
        }

        console.log('[DEBUG saveBlogPost] Title:', title, 'Content length:', content.length);

        if (!title || !title.trim()) {
            showNotification('Title is required', 'error');
            return;
        }

        if (!content || content.trim() === '') {
            showNotification('Content is required', 'error');
            return;
        }

        // Get SEO fields
        const seo = {
            metaTitle: document.getElementById('blogMetaTitle').value || title,
            metaDescription: document.getElementById('blogMetaDescription').value || excerpt || '',
            focusKeyword: document.getElementById('blogFocusKeyword').value || '',
            canonicalUrl: document.getElementById('blogCanonicalUrl').value || '',
            ogImage: document.getElementById('blogOgImage').value || featuredImage || '',
            noIndex: document.getElementById('blogNoIndex').checked || false
        };

        const postData = {
            title,
            slug,
            category: category || 'Uncategorized',
            excerpt: excerpt || '',
            content,
            featuredImage,
            tags,
            seo,
            isPublished,
            authorId: state.currentUser.uid,
            authorName: state.currentUser.firstName || state.currentUser.email,
            views: 0,
            updatedAt: serverTimestamp()
        };

        if (isPublished && !postId) {
            postData.publishedAt = serverTimestamp();
        }

        console.log('[DEBUG saveBlogPost] Saving post data:', postData);

        if (postId) {
            await updateDoc(doc(db, 'blog', postId), postData);
            showNotification('Blog post updated successfully', 'success');
        } else {
            postData.createdAt = serverTimestamp();
            await addDoc(collection(db, 'blog'), postData);
            showNotification('Blog post created successfully', 'success');
        }

        closeBlogModal();
        await loadBlogPosts();

    } catch (error) {
        console.error('Error saving blog post:', error);
        showNotification('Failed to save blog post: ' + error.message, 'error');
    }
}

async function deleteBlogPost(postId) {
    if (!confirm('Are you sure you want to delete this blog post?')) return;

    try {
        showLoading();
        await deleteDoc(doc(db, 'blog', postId));
        hideLoading();
        showNotification('Blog post deleted successfully', 'success');
        await loadBlogPosts();
    } catch (error) {
        hideLoading();
        console.error('Error deleting blog post:', error);
        showNotification('Failed to delete blog post', 'error');
    }
}

// ===========================
// CATEGORY MANAGEMENT
// ===========================

async function loadCategories() {
    try {
        const snapshot = await getDocs(collection(db, 'categories'));
        state.categories = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderCategoriesTable();
    } catch (error) {
        console.error('Error loading categories:', error);
        throw error;
    }
}

function renderCategoriesTable() {
    const tableHTML = `
        <div class="table-container">
            <div class="table-header">
                <h3>Product Categories</h3>
                <div class="table-actions">
                    <button class="btn btn-primary" onclick="window.adminApp.showCategoryForm()">
                        Add Category
                    </button>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Icon</th>
                        <th>Name</th>
                        <th>Slug</th>
                        <th>Description</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.categories.length === 0 ? `
                        <tr>
                            <td colspan="5">
                                <div class="empty-state">
                                    <div class="empty-state-icon">📁</div>
                                    <div class="empty-state-text">No categories found</div>
                                </div>
                            </td>
                        </tr>
                    ` : state.categories.map(category => `
                        <tr>
                            <td style="font-size: 1.5rem;">${category.icon || '📦'}</td>
                            <td>${category.name}</td>
                            <td>${category.slug}</td>
                            <td>${category.description || '-'}</td>
                            <td class="table-actions-cell">
                                <button class="btn btn-icon btn-secondary"
                                        onclick="window.adminApp.editCategory('${category.id}')"
                                        title="Edit">
                                    ✏️
                                </button>
                                <button class="btn btn-icon btn-danger"
                                        onclick="window.adminApp.deleteCategory('${category.id}')"
                                        title="Delete">
                                    🗑️
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('categoriesTable').innerHTML = tableHTML;
}

function showCategoryForm(categoryId = null) {
    const category = categoryId ? state.categories.find(c => c.id === categoryId) : null;
    const isEdit = !!category;

    const modalHTML = `
        <div class="modal-header">
            <h2>${isEdit ? 'Edit Category' : 'Add New Category'}</h2>
            <button class="modal-close" onclick="window.adminApp.closeModal()">&times;</button>
        </div>
        <div class="modal-body">
            <form id="categoryForm">
                <div class="form-group">
                    <label>Category Name *</label>
                    <input type="text" class="form-input" id="categoryName" value="${category?.name || ''}" required>
                </div>

                <div class="form-group">
                    <label>Slug *</label>
                    <input type="text" class="form-input" id="categorySlug" value="${category?.slug || ''}" required>
                </div>

                <div class="form-group">
                    <label>Icon (emoji)</label>
                    <input type="text" class="form-input" id="categoryIcon" value="${category?.icon || ''}" maxlength="2" placeholder="🏷️">
                </div>

                <div class="form-group">
                    <label>Description</label>
                    <textarea class="form-input" id="categoryDescription" rows="3">${category?.description || ''}</textarea>
                </div>
            </form>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="window.adminApp.closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="window.adminApp.saveCategory('${categoryId || ''}')">
                ${isEdit ? 'Update' : 'Create'} Category
            </button>
        </div>
    `;

    showModal(modalHTML);
}

async function saveCategory(categoryId) {
    try {
        const nameEl = document.getElementById('categoryName');
        const slugEl = document.getElementById('categorySlug');
        const iconEl = document.getElementById('categoryIcon');
        const descEl = document.getElementById('categoryDescription');

        if (!nameEl || !slugEl || !iconEl || !descEl) {
            console.error('Category form elements not found!');
            showNotification('Form error - please refresh the page', 'error');
            return;
        }

        const name = nameEl.value.trim();
        const slug = slugEl.value.trim() || generateSlug(name);
        const icon = iconEl.value.trim();
        const description = descEl.value.trim();

        if (!name) {
            showNotification('Category name is required', 'error');
            return;
        }

        if (!slug) {
            showNotification('Category slug is required', 'error');
            return;
        }

        const categoryData = {
            name,
            slug,
            icon,
            description,
            updatedAt: serverTimestamp()
        };

        if (categoryId) {
            await updateDoc(doc(db, 'categories', categoryId), categoryData);
            showNotification('Category updated successfully', 'success');
        } else {
            categoryData.createdAt = serverTimestamp();
            await addDoc(collection(db, 'categories'), categoryData);
            showNotification('Category created successfully', 'success');
        }

        closeModal();
        await loadCategories();

    } catch (error) {
        console.error('Error saving category:', error);
        showNotification('Failed to save category', 'error');
    }
}

async function deleteCategory(categoryId) {
    // Check if any products use this category
    const productsQuery = query(collection(db, 'products'), where('categoryId', '==', categoryId));
    const productsSnap = await getDocs(productsQuery);

    if (productsSnap.size > 0) {
        if (!confirm(`This category is used by ${productsSnap.size} product(s). Delete anyway?`)) {
            return;
        }
    }

    try {
        showLoading();
        await deleteDoc(doc(db, 'categories', categoryId));
        hideLoading();
        showNotification('Category deleted successfully', 'success');
        await loadCategories();
    } catch (error) {
        hideLoading();
        console.error('Error deleting category:', error);
        showNotification('Failed to delete category', 'error');
    }
}

// ===========================
// ORDERS MANAGEMENT
// ===========================

async function loadOrders() {
    try {
        const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        state.orders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderOrdersTable();
    } catch (error) {
        console.error('Error loading orders:', error);
        throw error;
    }
}

function renderOrdersTable() {
    const filteredOrders = state.orders.filter(order => {
        const matchesStatus = state.filters.orders.status === 'all' || order.status === state.filters.orders.status;
        const matchesSearch = !state.filters.orders.search ||
                             order.orderNumber.toLowerCase().includes(state.filters.orders.search.toLowerCase()) ||
                             order.customerEmail.toLowerCase().includes(state.filters.orders.search.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    const tableHTML = `
        <div class="table-container">
            <div class="table-header">
                <div class="table-search">
                    <input type="text" placeholder="Search orders..." id="orderSearch">
                    <select id="orderStatusFilter">
                        <option value="all">All Orders</option>
                        <option value="pending">Pending</option>
                        <option value="processing">Processing</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Order #</th>
                        <th>Customer</th>
                        <th>Date</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Payment</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredOrders.length === 0 ? `
                        <tr>
                            <td colspan="7">
                                <div class="empty-state">
                                    <div class="empty-state-icon">📦</div>
                                    <div class="empty-state-text">No orders found</div>
                                </div>
                            </td>
                        </tr>
                    ` : filteredOrders.map(order => `
                        <tr>
                            <td><strong>${order.orderNumber}</strong></td>
                            <td>${order.customerName}<br><small>${order.customerEmail}</small></td>
                            <td>${new Date(order.createdAt?.toDate()).toLocaleDateString()}</td>
                            <td>$${order.total?.toFixed(2)}</td>
                            <td>
                                <span class="table-badge badge-${order.status}">
                                    ${order.status}
                                </span>
                            </td>
                            <td>
                                <span class="table-badge badge-${order.paymentStatus === 'paid' ? 'active' : 'pending'}">
                                    ${order.paymentStatus}
                                </span>
                            </td>
                            <td class="table-actions-cell">
                                <button class="btn btn-icon btn-secondary"
                                        onclick="window.adminApp.viewOrder('${order.id}')"
                                        title="View Details">
                                    👁️
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('ordersTable').innerHTML = tableHTML;

    // Event listeners
    document.getElementById('orderSearch')?.addEventListener('input', (e) => {
        state.filters.orders.search = e.target.value;
        renderOrdersTable();
    });

    document.getElementById('orderStatusFilter')?.addEventListener('change', (e) => {
        state.filters.orders.status = e.target.value;
        renderOrdersTable();
    });
}

function viewOrder(orderId) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    const modalHTML = `
        <div class="modal-header">
            <h2>Order ${order.orderNumber}</h2>
            <button class="modal-close" onclick="window.adminApp.closeModal()">&times;</button>
        </div>
        <div class="modal-body">
            <div class="form-grid">
                <div class="form-group">
                    <label>Customer</label>
                    <p><strong>${order.customerName}</strong><br>${order.customerEmail}</p>
                </div>

                <div class="form-group">
                    <label>Order Date</label>
                    <p>${new Date(order.createdAt?.toDate()).toLocaleString()}</p>
                </div>

                <div class="form-group">
                    <label>Order Status</label>
                    <select id="orderStatus" class="w-full">
                        <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Processing</option>
                        <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Shipped</option>
                        <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                        <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Payment Status</label>
                    <select id="orderPaymentStatus" class="w-full">
                        <option value="pending" ${order.paymentStatus === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="paid" ${order.paymentStatus === 'paid' ? 'selected' : ''}>Paid</option>
                        <option value="failed" ${order.paymentStatus === 'failed' ? 'selected' : ''}>Failed</option>
                        <option value="refunded" ${order.paymentStatus === 'refunded' ? 'selected' : ''}>Refunded</option>
                    </select>
                </div>

                <div class="form-group form-group-full">
                    <label>Shipping Address</label>
                    <p>
                        ${order.shippingAddress?.street || ''}<br>
                        ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} ${order.shippingAddress?.zip || ''}<br>
                        ${order.shippingAddress?.country || ''}
                    </p>
                </div>

                <div class="form-group form-group-full">
                    <label>Order Items</label>
                    <table class="w-full">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Price</th>
                                <th>Qty</th>
                                <th>Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(order.items || []).map(item => `
                                <tr>
                                    <td>${item.productName}</td>
                                    <td>$${item.price?.toFixed(2)}</td>
                                    <td>${item.quantity}</td>
                                    <td>$${item.subtotal?.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3"><strong>Subtotal</strong></td>
                                <td><strong>$${order.subtotal?.toFixed(2)}</strong></td>
                            </tr>
                            <tr>
                                <td colspan="3">Tax</td>
                                <td>$${order.tax?.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td colspan="3">Shipping</td>
                                <td>$${order.shipping?.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td colspan="3"><strong>Total</strong></td>
                                <td><strong>$${order.total?.toFixed(2)}</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div class="form-group form-group-full">
                    <label>Order Notes</label>
                    <textarea id="orderNotes" rows="3">${order.notes || ''}</textarea>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="window.adminApp.closeModal()">Close</button>
            <button class="btn btn-warning" onclick="alert('Print invoice - Coming soon!')">Print Invoice</button>
            <button class="btn btn-info" onclick="alert('Send email - Coming soon!')">Email Customer</button>
            <button class="btn btn-primary" onclick="window.adminApp.updateOrder('${orderId}')">Update Order</button>
        </div>
    `;

    showModal(modalHTML);
}

async function updateOrder(orderId) {
    try {
        const status = document.getElementById('orderStatus').value;
        const paymentStatus = document.getElementById('orderPaymentStatus').value;
        const notes = document.getElementById('orderNotes').value;

        await updateDoc(doc(db, 'orders', orderId), {
            status,
            paymentStatus,
            notes,
            updatedAt: serverTimestamp()
        });

        showNotification('Order updated successfully', 'success');
        closeModal();
        await loadOrders();

    } catch (error) {
        console.error('Error updating order:', error);
        showNotification('Failed to update order', 'error');
    }
}

// ===========================
// MEDIA LIBRARY
// ===========================

async function loadMedia() {
    // Placeholder - media library functionality
    const mediaHTML = `
        <div class="table-container">
            <div class="table-header">
                <h3>Media Library</h3>
                <div class="table-actions">
                    <button class="btn btn-primary" onclick="alert('Upload media - Coming soon!')">
                        Upload Images
                    </button>
                </div>
            </div>
            <div class="empty-state" style="padding: 4rem;">
                <div class="empty-state-icon">🖼️</div>
                <div class="empty-state-text">Media library coming soon</div>
                <p style="color: var(--text-muted); margin-top: 1rem;">
                    For now, upload images directly when creating products or blog posts.
                </p>
            </div>
        </div>
    `;

    document.getElementById('mediaGrid').innerHTML = mediaHTML;
}

// ===========================
// IMAGE UPLOAD UTILITIES
// ===========================

function initializeImageUpload(type, existingImages = []) {
    console.log(`[DEBUG] Initializing ${type} image upload...`);

    const uploadZone = document.getElementById(`${type}ImageUpload`);
    const fileInput = document.getElementById(`${type}ImageInput`);
    const gallery = document.getElementById(`${type}ImageGallery`);
    const progressContainer = document.getElementById(`${type}UploadProgress`);

    console.log(`[DEBUG] Elements found:`, {
        uploadZone: !!uploadZone,
        fileInput: !!fileInput,
        gallery: !!gallery,
        progressContainer: !!progressContainer
    });

    if (!uploadZone || !fileInput) {
        console.error(`[ERROR] Missing required elements for ${type} upload`);
        return;
    }

    // Drag & drop handlers
    uploadZone.addEventListener('dragover', (e) => {
        console.log('[DEBUG] Dragover event');
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', async (e) => {
        console.log('[DEBUG] Drop event');
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('dragover');

        const files = Array.from(e.dataTransfer.files);
        await handleImageUpload(files, type, gallery, progressContainer);
    });

    // File input change
    fileInput.addEventListener('change', async (e) => {
        console.log('[DEBUG] File input changed');
        const files = Array.from(e.target.files);
        await handleImageUpload(files, type, gallery, progressContainer);
        fileInput.value = ''; // Reset input
    });

    console.log(`[DEBUG] ${type} image upload initialized successfully`);
}

async function handleImageUpload(files, type, gallery, progressContainer) {
    try {
        const category = type === 'blog' ? 'blog' : 'products';

        for (const file of files) {
            // Validate file
            if (!file.type.startsWith('image/')) {
                showNotification(`${file.name} is not an image`, 'error');
                continue;
            }

            if (file.size > 5 * 1024 * 1024) {
                showNotification(`${file.name} is too large (max 5MB)`, 'error');
                continue;
            }

            // Show progress
            const progressId = Date.now() + Math.random();
            const progressHTML = `
                <div class="progress-item" id="progress-${progressId}">
                    <div class="progress-info">
                        <span>${file.name}</span>
                        <span>Compressing...</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: 0%"></div>
                    </div>
                </div>
            `;
            progressContainer.insertAdjacentHTML('beforeend', progressHTML);

            try {
                // Client-side image compression
                const compressionOptions = {
                    maxSizeMB: 1,
                    maxWidthOrHeight: 1920,
                    useWebWorker: true,
                    fileType: file.type
                };

                const progressItem = document.getElementById(`progress-${progressId}`);
                const compressedFile = await imageCompression(file, compressionOptions);

                // Update progress
                if (progressItem) {
                    progressItem.querySelector('.progress-bar').style.width = '50%';
                    progressItem.querySelector('.progress-info span:last-child').textContent = 'Uploading...';
                }

                // Upload to Firebase Storage
                const timestamp = Date.now();
                const filename = `${category}/${timestamp}-${compressedFile.name}`;
                const storageRef = ref(storage, filename);

                await uploadBytes(storageRef, compressedFile);
                const downloadURL = await getDownloadURL(storageRef);

                // Update progress to complete
                if (progressItem) {
                    progressItem.querySelector('.progress-bar').style.width = '100%';
                    progressItem.querySelector('.progress-info span:last-child').textContent = '100%';
                    setTimeout(() => progressItem.remove(), 2000);
                }

                // Add to gallery
                const galleryItem = document.createElement('div');
                galleryItem.className = 'gallery-item';
                galleryItem.dataset.url = downloadURL;
                galleryItem.innerHTML = `
                    <img src="${downloadURL}" alt="${file.name}">
                    <button type="button" class="gallery-item-remove" onclick="this.parentElement.remove()">×</button>
                `;
                gallery.appendChild(galleryItem);

                // Show savings
                const savings = ((file.size - compressedFile.size) / file.size * 100).toFixed(0);
                showNotification(`Image uploaded successfully (${savings}% smaller)`, 'success');

            } catch (uploadError) {
                const progressItem = document.getElementById(`progress-${progressId}`);
                if (progressItem) {
                    progressItem.remove();
                }
                throw uploadError;
            }
        }

    } catch (error) {
        console.error('Upload error:', error);
        showNotification(error.message || 'Failed to upload image', 'error');
    }
}

// OLD FUNCTION - REMOVED (Now using Firebase Storage in initialization section)

function removeBlogImage() {
    document.getElementById('blogImageUrl').dataset.url = '';
    const gallery = document.getElementById('blogImageGallery');
    if (gallery) {
        gallery.innerHTML = '';
    }
    console.log('[DEBUG] Blog featured image removed');
}

function removeProductImage(url) {
    const gallery = document.getElementById('productImageGallery');
    const item = gallery.querySelector(`[data-url="${url}"]`);
    if (item) item.remove();
}

// ===========================
// QUILL EDITOR
// ===========================

function initializeQuillEditor(content) {
    console.log('[DEBUG] Initializing Quill editor with content length:', content?.length || 0);

    // Quill is already loaded via CDN in HTML, so we should use it directly
    if (window.Quill) {
        initQuill(content);
    } else {
        // Fallback: wait for Quill to load
        console.log('[DEBUG] Waiting for Quill to load...');
        const checkQuill = setInterval(() => {
            if (window.Quill) {
                console.log('[DEBUG] Quill loaded, initializing editor');
                clearInterval(checkQuill);
                initQuill(content);
            }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
            clearInterval(checkQuill);
            if (!window.Quill) {
                console.error('[ERROR] Quill failed to load');
                showNotification('Editor failed to load. Please refresh the page.', 'error');
            }
        }, 5000);
    }
}

function initQuill(content) {
    try {
        const editorElement = document.getElementById('blogEditor');
        if (!editorElement) {
            console.error('[ERROR] Blog editor element not found');
            return;
        }

        // Clear any existing editor instance
        editorElement.innerHTML = '';

        window.quillEditor = new Quill('#blogEditor', {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline', 'strike'],
                    ['blockquote', 'code-block'],
                    [{ 'header': 1 }, { 'header': 2 }],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'indent': '-1'}, { 'indent': '+1' }],
                    ['link', 'image'],
                    ['clean']
                ]
            },
            placeholder: 'Write your blog post content here...'
        });

        if (content && content.trim()) {
            console.log('[DEBUG] Setting editor content');
            window.quillEditor.root.innerHTML = content;
        }

        console.log('[DEBUG] Quill editor initialized successfully');
    } catch (error) {
        console.error('[ERROR] Failed to initialize Quill:', error);
        showNotification('Editor initialization failed: ' + error.message, 'error');
    }
}

// ===========================
// UTILITY FUNCTIONS
// ===========================

function generateSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function getCategoryName(categoryId) {
    const category = state.categories.find(c => c.id === categoryId);
    return category ? category.name : 'Uncategorized';
}

function showModal(html) {
    const modal = document.getElementById('modal');
    modal.innerHTML = `<div class="modal-content">${html}</div>`;
    modal.classList.add('active');
    console.log('[DEBUG showModal] Modal displayed');
}

function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('active');
    modal.innerHTML = '';
}

function closeBlogModal() {
    const modal = document.getElementById('blogModal');
    modal.classList.remove('active');
    // Clear form
    document.getElementById('blogForm').reset();
    // Clear editor
    if (window.quillEditor) {
        window.quillEditor.setContents([]);
    }
    // Clear image gallery
    document.getElementById('blogImageGallery').innerHTML = '';
}

function toggleSEOSection() {
    const seoSection = document.querySelector('.seo-section');
    if (seoSection) {
        seoSection.classList.toggle('collapsed');
    }
}

function showLoading() {
    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div class="spinner"></div>
        <div class="loading-text">Loading...</div>
    `;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.remove();
}

function showNotification(message, type = 'info') {
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-icon">${icons[type]}</div>
        <div class="notification-content">
            <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideInRight 0.3s ease-out reverse';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// ===========================
// INITIALIZATION
// ===========================

async function initializeAdmin() {
    // Load categories first (needed for products)
    await loadCategories();

    // Set up navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.section;
            navigateTo(page);
        });
    });

    // Set up logout button
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Set up logo and favicon upload
    setupLogoUpload();
    setupFaviconUpload();

    // Set up blog modal close buttons
    const blogModal = document.getElementById('blogModal');
    blogModal.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', closeBlogModal);
    });

    // Set up blog form submit handler
    const blogForm = document.getElementById('blogForm');
    blogForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveBlogPost();
    });

    // Set up blog image upload
    const blogImageUpload = document.getElementById('blogImageUpload');
    const blogImageInput = document.getElementById('blogImageInput');

    console.log('[DEBUG] Blog image upload elements found:', !!blogImageUpload, !!blogImageInput);

    blogImageUpload.addEventListener('click', (e) => {
        console.log('[DEBUG] Blog upload zone clicked');
        // Prevent event propagation
        e.stopPropagation();
        blogImageInput.click();
    });

    blogImageInput.addEventListener('change', async (e) => {
        console.log('[DEBUG] Blog image input changed, files:', e.target.files);
        const file = e.target.files[0];
        if (!file) {
            console.log('[DEBUG] No file selected');
            return;
        }

        try {
            console.log('[DEBUG] Starting image upload for:', file.name, file.type, file.size);
            showLoading();

            // Check if imageCompression is available
            if (typeof imageCompression === 'undefined') {
                throw new Error('Image compression library not loaded');
            }

            // Client-side image compression
            const compressionOptions = {
                maxSizeMB: 1,
                maxWidthOrHeight: 1920,
                useWebWorker: true,
                fileType: file.type
            };

            console.log('[DEBUG] Compressing image...');
            const compressedFile = await imageCompression(file, compressionOptions);
            console.log('[DEBUG] Image compressed:', compressedFile.size, 'bytes');

            // Upload to Firebase Storage
            const timestamp = Date.now();
            const filename = `blog/${timestamp}-${compressedFile.name}`;
            const storageRef = ref(storage, filename);

            console.log('[DEBUG] Uploading to Firebase Storage:', filename);
            const uploadResult = await uploadBytes(storageRef, compressedFile);
            console.log('[DEBUG] Upload bytes complete');

            const downloadURL = await getDownloadURL(storageRef);
            console.log('[DEBUG] Upload successful:', downloadURL);

            // Show preview in gallery
            const gallery = document.getElementById('blogImageGallery');
            gallery.innerHTML = `
                <div class="gallery-item">
                    <img src="${downloadURL}" alt="Featured image">
                    <button type="button" class="gallery-item-remove" onclick="this.parentElement.remove()">×</button>
                </div>
            `;

            hideLoading();

            // Show savings
            const savings = ((file.size - compressedFile.size) / file.size * 100).toFixed(0);
            showNotification(`Image uploaded successfully (${savings}% smaller)`, 'success');

        } catch (error) {
            hideLoading();
            console.error('Upload error:', error);
            showNotification(error.message || 'Failed to upload image', 'error');
        }

        // Reset file input
        e.target.value = '';
    });

    // Load initial page (dashboard)
    navigateTo('dashboard');
}

// Login form handler
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    try {
        await login(email, password);
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.add('show');
    }
});

// ===========================
// PRINTFUL INTEGRATION
// ===========================

async function syncPrintfulProducts() {
    try {
        showLoading();
        showNotification('Syncing products from Printful...', 'info');

        const response = await fetch(`${CONFIG.API_URL || 'http://localhost:5000'}/api/printful/sync-products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        hideLoading();

        if (data.success) {
            showNotification(`Successfully synced ${data.syncedCount} products from Printful!`, 'success');

            // Reload products
            await loadProducts();
        } else {
            throw new Error(data.message || 'Failed to sync products');
        }

    } catch (error) {
        hideLoading();
        console.error('Error syncing Printful products:', error);
        showNotification(`Failed to sync Printful products: ${error.message}`, 'error');
    }
}

// ===========================
// VARIANT MANAGEMENT
// ===========================

function addVariant() {
    const container = document.getElementById('variantsContainer');
    const existingVariants = container.querySelectorAll('.variant-row');
    const index = existingVariants.length;

    const variantHTML = `
        <div class="variant-row" data-variant-index="${index}" style="background: #2a2a2a; padding: 15px; margin-bottom: 10px; border-radius: 4px; position: relative;">
            <button type="button" class="btn btn-sm btn-danger" onclick="window.adminApp.removeVariant(${index})" style="position: absolute; top: 10px; right: 10px;">×</button>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <div>
                    <label style="font-size: 12px; color: #aaa;">SKU *</label>
                    <input type="text" class="form-input variant-sku" placeholder="BTN-BLK-10" required style="font-size: 14px;">
                </div>
                <div>
                    <label style="font-size: 12px; color: #aaa;">Price *</label>
                    <input type="number" class="form-input variant-price" step="0.01" required style="font-size: 14px;">
                </div>
                <div>
                    <label style="font-size: 12px; color: #aaa;">Stock *</label>
                    <input type="number" class="form-input variant-stock" value="0" required style="font-size: 14px;">
                </div>
            </div>

            <div>
                <label style="font-size: 12px; color: #aaa;">Attributes (e.g., Color: Black, Size: 10mm)</label>
                <div class="variant-attributes" style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button type="button" class="btn btn-sm" onclick="window.adminApp.addAttribute(${index})" style="font-size: 12px; padding: 5px 10px;">+ Add Attribute</button>
                </div>
            </div>
        </div>
    `;

    // Remove "No variants" message if exists
    const noVariantsMsg = container.querySelector('div[style*="color: #888"]');
    if (noVariantsMsg) {
        noVariantsMsg.remove();
    }

    container.insertAdjacentHTML('beforeend', variantHTML);
}

function removeVariant(index) {
    const variantRow = document.querySelector(`.variant-row[data-variant-index="${index}"]`);
    if (variantRow) {
        variantRow.remove();
    }

    // Show "No variants" message if no variants left
    const container = document.getElementById('variantsContainer');
    const remainingVariants = container.querySelectorAll('.variant-row');
    if (remainingVariants.length === 0) {
        container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">No variants. Click "+ Add Variant" to create size/color options.</div>';
    }
}

function addAttribute(variantIndex) {
    const attributeName = prompt('Attribute name (e.g., Color, Size, Material):');
    if (!attributeName) return;

    const attributeValue = prompt(`${attributeName} value (e.g., Black, 10mm, Cotton):`);
    if (!attributeValue) return;

    const variantRow = document.querySelector(`.variant-row[data-variant-index="${variantIndex}"]`);
    const attributesContainer = variantRow.querySelector('.variant-attributes');
    const addButton = attributesContainer.querySelector('button');

    const attributeTag = `
        <div class="attribute-tag" data-key="${attributeName}" data-value="${attributeValue}" style="background: #444; padding: 5px 10px; border-radius: 4px; display: flex; align-items: center; gap: 5px;">
            <span style="font-size: 12px;">${attributeName}: ${attributeValue}</span>
            <button type="button" onclick="this.parentElement.remove()" style="background: none; border: none; color: #ff4444; cursor: pointer; font-size: 14px; padding: 0;">×</button>
        </div>
    `;

    addButton.insertAdjacentHTML('beforebegin', attributeTag);
}

// ===========================
// SITE IDENTITY MANAGEMENT
// ===========================

async function loadSiteIdentity() {
    try {
        const settingsDoc = await getDoc(doc(db, 'siteSettings', 'identity'));
        const settings = settingsDoc.exists() ? settingsDoc.data() : {};

        // Load basic info
        document.getElementById('siteName').value = settings.siteName || '';
        document.getElementById('siteTagline').value = settings.tagline || '';
        document.getElementById('siteDescription').value = settings.description || '';

        // Load colors
        if (settings.colors) {
            document.getElementById('primaryColor').value = settings.colors.primary || '#8b5cf6';
            document.getElementById('primaryColorText').value = settings.colors.primary || '#8b5cf6';
            document.getElementById('secondaryColor').value = settings.colors.secondary || '#dc2626';
            document.getElementById('secondaryColorText').value = settings.colors.secondary || '#dc2626';
            document.getElementById('accentColor').value = settings.colors.accent || '#fbbf24';
            document.getElementById('accentColorText').value = settings.colors.accent || '#fbbf24';
        }

        // Load social media
        if (settings.social) {
            document.getElementById('socialInstagram').value = settings.social.instagram || '';
            document.getElementById('socialFacebook').value = settings.social.facebook || '';
            document.getElementById('socialTwitter').value = settings.social.twitter || '';
            document.getElementById('socialTiktok').value = settings.social.tiktok || '';
            document.getElementById('socialPinterest').value = settings.social.pinterest || '';
        }

        // Load contact info
        if (settings.contact) {
            document.getElementById('contactEmail').value = settings.contact.email || '';
            document.getElementById('contactPhone').value = settings.contact.phone || '';
            document.getElementById('contactAddress').value = settings.contact.address || '';
        }

        // Load logo and favicon
        if (settings.logo) {
            document.getElementById('logoPreview').innerHTML = `<img src="${settings.logo}" alt="Logo">`;
        }
        if (settings.favicon) {
            document.getElementById('faviconPreview').innerHTML = `<img src="${settings.favicon}" alt="Favicon">`;
        }

        // Set up color pickers sync
        setupColorPickers();

        console.log('[SITE IDENTITY] Settings loaded successfully');
    } catch (error) {
        console.error('Error loading site identity:', error);
        showNotification('Failed to load site identity settings', 'error');
    }
}

function setupColorPickers() {
    // Sync color picker with text input
    const colorInputs = [
        { picker: 'primaryColor', text: 'primaryColorText' },
        { picker: 'secondaryColor', text: 'secondaryColorText' },
        { picker: 'accentColor', text: 'accentColorText' }
    ];

    colorInputs.forEach(({ picker, text }) => {
        const pickerEl = document.getElementById(picker);
        const textEl = document.getElementById(text);

        if (pickerEl && textEl) {
            pickerEl.addEventListener('input', (e) => {
                textEl.value = e.target.value;
            });

            textEl.addEventListener('input', (e) => {
                pickerEl.value = e.target.value;
            });
        }
    });
}

async function saveSiteIdentity() {
    try {
        showLoading();

        // Get logo and favicon URLs
        const logoPreview = document.getElementById('logoPreview').querySelector('img');
        const faviconPreview = document.getElementById('faviconPreview').querySelector('img');

        const settingsData = {
            siteName: document.getElementById('siteName').value,
            tagline: document.getElementById('siteTagline').value,
            description: document.getElementById('siteDescription').value,
            logo: logoPreview ? logoPreview.src : null,
            favicon: faviconPreview ? faviconPreview.src : null,
            colors: {
                primary: document.getElementById('primaryColor').value,
                secondary: document.getElementById('secondaryColor').value,
                accent: document.getElementById('accentColor').value
            },
            social: {
                instagram: document.getElementById('socialInstagram').value,
                facebook: document.getElementById('socialFacebook').value,
                twitter: document.getElementById('socialTwitter').value,
                tiktok: document.getElementById('socialTiktok').value,
                pinterest: document.getElementById('socialPinterest').value
            },
            contact: {
                email: document.getElementById('contactEmail').value,
                phone: document.getElementById('contactPhone').value,
                address: document.getElementById('contactAddress').value
            },
            updatedAt: serverTimestamp()
        };

        await updateDoc(doc(db, 'siteSettings', 'identity'), settingsData).catch(async () => {
            // Document doesn't exist, create it
            await addDoc(collection(db, 'siteSettings'), settingsData);
        });

        hideLoading();
        showNotification('Site identity saved successfully!', 'success');
    } catch (error) {
        hideLoading();
        console.error('Error saving site identity:', error);
        showNotification('Failed to save site identity', 'error');
    }
}

// ===========================
// TEMPLATES MANAGEMENT
// ===========================

async function loadTemplates() {
    try {
        const settingsDoc = await getDoc(doc(db, 'siteSettings', 'templates'));
        const settings = settingsDoc.exists() ? settingsDoc.data() : {};

        // Load template selections
        if (settings.header) {
            const headerRadio = document.querySelector(`input[name="headerTemplate"][value="${settings.header}"]`);
            if (headerRadio) headerRadio.checked = true;
        }

        if (settings.footer) {
            const footerRadio = document.querySelector(`input[name="footerTemplate"][value="${settings.footer}"]`);
            if (footerRadio) footerRadio.checked = true;
        }

        if (settings.colorScheme) {
            const schemeRadio = document.querySelector(`input[name="colorScheme"][value="${settings.colorScheme}"]`);
            if (schemeRadio) schemeRadio.checked = true;
        }

        console.log('[TEMPLATES] Settings loaded successfully');
    } catch (error) {
        console.error('Error loading templates:', error);
        showNotification('Failed to load template settings', 'error');
    }
}

async function saveTemplates() {
    try {
        showLoading();

        const settingsData = {
            header: document.querySelector('input[name="headerTemplate"]:checked')?.value || 'minimal',
            footer: document.querySelector('input[name="footerTemplate"]:checked')?.value || 'simple',
            colorScheme: document.querySelector('input[name="colorScheme"]:checked')?.value || 'gothic-purple',
            updatedAt: serverTimestamp()
        };

        await updateDoc(doc(db, 'siteSettings', 'templates'), settingsData).catch(async () => {
            // Document doesn't exist, create it with ID
            await setDoc(doc(db, 'siteSettings', 'templates'), settingsData);
        });

        hideLoading();
        showNotification('Templates saved successfully!', 'success');
    } catch (error) {
        hideLoading();
        console.error('Error saving templates:', error);
        showNotification('Failed to save templates', 'error');
    }
}

// ===========================
// MODULES MANAGEMENT
// ===========================

async function loadModules() {
    try {
        // Get module states from Firestore
        const settingsDoc = await getDoc(doc(db, 'siteSettings', 'modules'));
        const modules = settingsDoc.exists() ? settingsDoc.data() : {};

        // Load module toggles
        Object.keys(modules).forEach(moduleKey => {
            const toggle = document.getElementById(`module${capitalize(moduleKey)}`);
            if (toggle) {
                toggle.checked = modules[moduleKey].enabled !== false;
            }
        });

        // Load module stats
        await loadModuleStats();

        console.log('[MODULES] Settings loaded successfully');
    } catch (error) {
        console.error('Error loading modules:', error);
        showNotification('Failed to load module settings', 'error');
    }
}

async function loadModuleStats() {
    try {
        // Load product/order stats
        const productsSnap = await getDocs(collection(db, 'products'));
        const ordersSnap = await getDocs(collection(db, 'orders'));
        const blogSnap = await getDocs(collection(db, 'blog'));

        // Update stats in UI
        const statsElements = {
            statsProducts: productsSnap.size,
            statsOrders: ordersSnap.size,
            statsPosts: blogSnap.size
        };

        Object.entries(statsElements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });

        // You can add more stats here (views, subscribers, reviews, etc.)
    } catch (error) {
        console.error('Error loading module stats:', error);
    }
}

async function saveModules() {
    try {
        showLoading();

        const modulesData = {
            ecommerce: { enabled: document.getElementById('moduleEcommerce')?.checked || false },
            blog: { enabled: document.getElementById('moduleBlog')?.checked || false },
            newsletter: { enabled: document.getElementById('moduleNewsletter')?.checked || false },
            reviews: { enabled: document.getElementById('moduleReviews')?.checked || false },
            wishlist: { enabled: document.getElementById('moduleWishlist')?.checked || false },
            recommendations: { enabled: document.getElementById('moduleRecommendations')?.checked || false },
            comments: { enabled: document.getElementById('moduleComments')?.checked || false },
            analytics: { enabled: document.getElementById('moduleAnalytics')?.checked || false },
            seo: { enabled: document.getElementById('moduleSEO')?.checked || false },
            coupons: { enabled: document.getElementById('moduleCoupons')?.checked || false },
            updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, 'siteSettings', 'modules'), modulesData);

        hideLoading();
        showNotification('Modules saved successfully!', 'success');
    } catch (error) {
        hideLoading();
        console.error('Error saving modules:', error);
        showNotification('Failed to save modules', 'error');
    }
}

// Helper function to capitalize first letter
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Setup logo upload
function setupLogoUpload() {
    const logoInput = document.getElementById('logoInput');
    const logoPreview = document.getElementById('logoPreview');

    if (!logoInput) return;

    logoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            showLoading();

            // Compress and upload
            const compressionOptions = {
                maxSizeMB: 0.5,
                maxWidthOrHeight: 500,
                useWebWorker: true
            };

            const compressedFile = await imageCompression(file, compressionOptions);

            // Upload to Firebase Storage
            const timestamp = Date.now();
            const filename = `branding/logo-${timestamp}.png`;
            const storageRef = ref(storage, filename);

            await uploadBytes(storageRef, compressedFile);
            const downloadURL = await getDownloadURL(storageRef);

            // Show preview
            logoPreview.innerHTML = `<img src="${downloadURL}" alt="Logo">`;

            hideLoading();
            showNotification('Logo uploaded successfully!', 'success');
        } catch (error) {
            hideLoading();
            console.error('Logo upload error:', error);
            showNotification('Failed to upload logo', 'error');
        }

        e.target.value = '';
    });
}

// Setup favicon upload
function setupFaviconUpload() {
    const faviconInput = document.getElementById('faviconInput');
    const faviconPreview = document.getElementById('faviconPreview');

    if (!faviconInput) return;

    faviconInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            showLoading();

            // Compress and upload
            const compressionOptions = {
                maxSizeMB: 0.1,
                maxWidthOrHeight: 64,
                useWebWorker: true
            };

            const compressedFile = await imageCompression(file, compressionOptions);

            // Upload to Firebase Storage
            const timestamp = Date.now();
            const filename = `branding/favicon-${timestamp}.png`;
            const storageRef = ref(storage, filename);

            await uploadBytes(storageRef, compressedFile);
            const downloadURL = await getDownloadURL(storageRef);

            // Show preview
            faviconPreview.innerHTML = `<img src="${downloadURL}" alt="Favicon">`;

            hideLoading();
            showNotification('Favicon uploaded successfully!', 'success');
        } catch (error) {
            hideLoading();
            console.error('Favicon upload error:', error);
            showNotification('Failed to upload favicon', 'error');
        }

        e.target.value = '';
    });
}

// ===========================
// EXPORT PUBLIC API
// ===========================

window.adminApp = {
    navigateTo,
    logout,

    // Products
    showProductForm,
    saveProduct,
    editProduct: (id) => showProductForm(id),
    deleteProduct,
    removeProductImage,
    syncPrintfulProducts,

    // Blog
    showBlogForm,
    saveBlogPost,
    editBlogPost: (id) => showBlogForm(id),
    deleteBlogPost,
    closeBlogModal,

    // Categories
    showCategoryForm,
    saveCategory,
    editCategory: (id) => showCategoryForm(id),
    deleteCategory,

    // Orders
    viewOrder,
    updateOrder,

    // Variants
    addVariant,
    removeVariant,
    addAttribute,

    // UI
    closeModal,
    showNotification,

    // Site Settings
    loadSiteIdentity,
    saveSiteIdentity,
    loadTemplates,
    saveTemplates,
    loadModules,
    saveModules
};

console.log('%c🌙 GronderfulShops Admin Panel 🌙', 'color: #8b5cf6; font-size: 20px; font-weight: bold;');
console.log('%cWelcome to the War Room ✨', 'color: #c4b5fd; font-size: 14px;');
console.log('%c[VERSION] Admin.js v2024-10-24-DELETE-FIX', 'background: #22c55e; color: white; padding: 2px 4px; font-weight: bold;');

// ===========================
// GLOBAL DRAG & DROP PREVENTION
// ===========================
// Prevent default browser behavior of opening files when dropped anywhere
document.addEventListener('dragover', (e) => {
    e.preventDefault();
}, false);

document.addEventListener('drop', (e) => {
    // Only prevent default if not dropping on an upload zone
    if (!e.target.closest('.image-upload-zone')) {
        e.preventDefault();
    }
}, false);

// ===========================
// EXPORTS FOR admin-users.js
// ===========================
export { showModal, showNotification, closeModal, navigateTo };
