// Cart Management
document.addEventListener('DOMContentLoaded', () => {
    initCart();
    initMobileNav();
});

// Initialize cart
function initCart() {
    const cart = getCart();
    renderCart(cart);
    updateNavCartCount();
}

// Get cart from localStorage
function getCart() {
    return JSON.parse(localStorage.getItem('gronderful_cart') || '[]');
}

// Save cart to localStorage
function saveCart(cart) {
    localStorage.setItem('gronderful_cart', JSON.stringify(cart));
    updateNavCartCount();
}

// Render cart
function renderCart(cart) {
    const cartContent = document.getElementById('cartContent');

    if (cart.length === 0) {
        cartContent.innerHTML = `
            <div class="empty-cart">
                <div class="empty-cart-icon">🛒</div>
                <h2>Your Cart is Empty</h2>
                <p>Looks like you haven't added any mystical treasures to your cart yet.</p>
                <a href="index.html#shop" class="btn-primary">Start Shopping</a>
            </div>
        `;
        return;
    }

    const cartHTML = `
        <div class="cart-items">
            ${cart.map((item, index) => renderCartItem(item, index)).join('')}
        </div>
        <div class="cart-summary">
            ${renderCartSummary(cart)}
        </div>
    `;

    cartContent.innerHTML = cartHTML;

    // Attach event listeners
    attachCartEventListeners();
}

// Render single cart item
function renderCartItem(item, index) {
    const itemTotal = item.price * item.quantity;

    return `
        <div class="cart-item" data-index="${index}">
            <div class="item-image">
                <img src="${item.image || '/placeholder.jpg'}" alt="${item.name}">
            </div>
            <div class="item-details">
                <div class="item-name">
                    <a href="product.html?slug=${getSlugFromName(item.name)}">${item.name}</a>
                </div>
                ${item.variantName ? `<div class="item-variant">Variant: ${item.variantName}</div>` : ''}
                <div class="item-price">$${item.price.toFixed(2)} each</div>
            </div>
            <div class="item-actions">
                <div class="quantity-controls">
                    <button class="quantity-btn decrease-qty" data-index="${index}">-</button>
                    <input type="number" class="quantity-input" value="${item.quantity}" min="1" data-index="${index}">
                    <button class="quantity-btn increase-qty" data-index="${index}">+</button>
                </div>
                <div class="item-total">$${itemTotal.toFixed(2)}</div>
                <button class="remove-btn" data-index="${index}">Remove</button>
            </div>
        </div>
    `;
}

// Render cart summary
function renderCartSummary(cart) {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.1; // 10% tax
    const shipping = subtotal > 50 ? 0 : 9.99; // Free shipping over $50
    const total = subtotal + tax + shipping;

    return `
        <h2 class="summary-title">Order Summary</h2>

        <div class="summary-row">
            <span>Subtotal (${cart.reduce((sum, item) => sum + item.quantity, 0)} items)</span>
            <span>$${subtotal.toFixed(2)}</span>
        </div>

        <div class="summary-row">
            <span>Tax (10%)</span>
            <span>$${tax.toFixed(2)}</span>
        </div>

        <div class="summary-row">
            <span>Shipping</span>
            <span>${shipping === 0 ? 'FREE' : '$' + shipping.toFixed(2)}</span>
        </div>

        ${subtotal < 50 && subtotal > 0 ? `
            <div class="shipping-estimate">
                Add $${(50 - subtotal).toFixed(2)} more for FREE shipping!
            </div>
        ` : ''}

        <div class="summary-row total">
            <span>Total</span>
            <span>$${total.toFixed(2)}</span>
        </div>

        <button class="checkout-btn" onclick="proceedToCheckout()">
            Proceed to Checkout
        </button>

        <button class="continue-shopping" onclick="continueShopping()">
            Continue Shopping
        </button>

        <div class="coupon-section">
            <label style="color: #a78bfa; margin-bottom: 0.5rem; display: block; font-weight: 600;">
                Have a Coupon Code?
            </label>
            <div class="coupon-input-group">
                <input type="text" class="coupon-input" id="couponInput" placeholder="Enter code">
                <button class="apply-btn" onclick="applyCoupon()">Apply</button>
            </div>
        </div>
    `;
}

// Attach event listeners
function attachCartEventListeners() {
    // Decrease quantity buttons
    document.querySelectorAll('.decrease-qty').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            updateQuantity(index, -1);
        });
    });

    // Increase quantity buttons
    document.querySelectorAll('.increase-qty').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            updateQuantity(index, 1);
        });
    });

    // Quantity input changes
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            const newQty = parseInt(e.target.value);
            if (newQty >= 1) {
                setQuantity(index, newQty);
            } else {
                e.target.value = 1;
                setQuantity(index, 1);
            }
        });
    });

    // Remove buttons
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            removeItem(index);
        });
    });
}

// Update quantity (increment/decrement)
function updateQuantity(index, change) {
    const cart = getCart();
    if (cart[index]) {
        cart[index].quantity = Math.max(1, cart[index].quantity + change);
        saveCart(cart);
        renderCart(cart);
        showToast(change > 0 ? 'Quantity increased' : 'Quantity decreased');
    }
}

// Set specific quantity
function setQuantity(index, quantity) {
    const cart = getCart();
    if (cart[index]) {
        cart[index].quantity = quantity;
        saveCart(cart);
        renderCart(cart);
        showToast('Quantity updated');
    }
}

// Remove item from cart
function removeItem(index) {
    const cart = getCart();
    if (cart[index]) {
        const itemName = cart[index].name;
        cart.splice(index, 1);
        saveCart(cart);
        renderCart(cart);
        showToast(`${itemName} removed from cart`);
    }
}

// Proceed to checkout
async function proceedToCheckout() {
    const cart = getCart();
    if (cart.length === 0) {
        showToast('Your cart is empty');
        return;
    }

    // Prompt for customer email
    const email = prompt('Please enter your email address for order confirmation:');
    if (!email) {
        return; // User cancelled
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('Please enter a valid email address', 'error');
        return;
    }

    // Show loading state
    const checkoutBtn = document.querySelector('.checkout-btn');
    const originalBtnText = checkoutBtn.textContent;
    checkoutBtn.textContent = 'Processing...';
    checkoutBtn.disabled = true;

    try {
        // Call Square checkout API (works both locally and in production)
        const apiUrl = window.location.hostname === 'localhost'
            ? 'http://localhost:8081/api/checkout.php'
            : '/api/checkout.php';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                cart: cart,
                customerEmail: email
            })
        });

        const data = await response.json();

        if (data.success && data.checkoutUrl) {
            // Redirect to Square checkout page
            window.location.href = data.checkoutUrl;
        } else {
            throw new Error(data.error || 'Failed to create checkout session');
        }
    } catch (error) {
        console.error('Checkout error:', error);
        showToast('Checkout failed: ' + error.message, 'error');

        // Restore button state
        checkoutBtn.textContent = originalBtnText;
        checkoutBtn.disabled = false;
    }
}

// Continue shopping
function continueShopping() {
    window.location.href = 'index.html#shop';
}

// Apply coupon (placeholder)
function applyCoupon() {
    const couponInput = document.getElementById('couponInput');
    const code = couponInput.value.trim().toUpperCase();

    if (!code) {
        showToast('Please enter a coupon code');
        return;
    }

    // Placeholder coupon codes
    const validCoupons = {
        'MAGIC10': 0.10,    // 10% off
        'WELCOME20': 0.20,  // 20% off
        'MYSTIC25': 0.25    // 25% off
    };

    if (validCoupons[code]) {
        const discount = validCoupons[code];
        showToast(`Coupon applied! ${(discount * 100)}% off`);
        // In a real app, you'd store this and apply it to the total
        // For now, just show success message
    } else {
        showToast('Invalid coupon code', 'error');
    }

    couponInput.value = '';
}

// Update nav cart count
function updateNavCartCount() {
    const cart = getCart();
    const count = cart.reduce((total, item) => total + item.quantity, 0);
    const cartCountEl = document.getElementById('navCartCount');
    if (cartCountEl) {
        cartCountEl.textContent = count;
    }
}

// Get slug from product name (simplified)
function getSlugFromName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Mobile nav toggle
function initMobileNav() {
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    navToggle?.addEventListener('click', () => {
        navMenu.classList.toggle('active');
    });
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    if (type === 'error') {
        toast.style.background = 'rgba(239, 68, 68, 0.95)';
    } else {
        toast.style.background = 'rgba(167, 139, 250, 0.95)';
    }

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Make functions globally available
window.proceedToCheckout = proceedToCheckout;
window.continueShopping = continueShopping;
window.applyCoupon = applyCoupon;
