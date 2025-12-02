// ===========================
// MOBILE NAVIGATION TOGGLE
// ===========================

const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');

navToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');

    // Animate hamburger icon
    const spans = navToggle.querySelectorAll('span');
    if (navMenu.classList.contains('active')) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(7px, -6px)';
    } else {
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
    }
});

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        const spans = navToggle.querySelectorAll('span');
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
    });
});

// ===========================
// SMOOTH SCROLLING
// ===========================

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');

        // Don't prevent default for empty href or just "#"
        if (href === '#' || href === '') {
            e.preventDefault();
            return;
        }

        const target = document.querySelector(href);
        if (target) {
            e.preventDefault();
            const offsetTop = target.offsetTop - 80; // Account for fixed navbar

            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    });
});

// ===========================
// SHOP FILTERS
// ===========================

const filterButtons = document.querySelectorAll('.filter-btn');
const productCards = document.querySelectorAll('.product-card');

filterButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all buttons
        filterButtons.forEach(btn => btn.classList.remove('active'));

        // Add active class to clicked button
        button.classList.add('active');

        const filter = button.getAttribute('data-filter');

        // Filter products
        productCards.forEach(card => {
            if (filter === 'all') {
                card.style.display = 'block';
                // Fade in animation
                card.style.animation = 'fadeInUp 0.5s ease-out';
            } else {
                const category = card.getAttribute('data-category');
                if (category === filter) {
                    card.style.display = 'block';
                    card.style.animation = 'fadeInUp 0.5s ease-out';
                } else {
                    card.style.display = 'none';
                }
            }
        });
    });
});

// ===========================
// NAVBAR BACKGROUND ON SCROLL
// ===========================

const navbar = document.querySelector('.navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
        navbar.style.background = 'rgba(10, 0, 20, 0.98)';
        navbar.style.boxShadow = '0 5px 20px rgba(139, 92, 246, 0.2)';
    } else {
        navbar.style.background = 'rgba(10, 0, 20, 0.95)';
        navbar.style.boxShadow = 'none';
    }

    lastScroll = currentScroll;
});

// ===========================
// ADD TO CART FUNCTIONALITY
// ===========================

const cartButtons = document.querySelectorAll('.btn-cart');
let cart = [];

cartButtons.forEach(button => {
    button.addEventListener('click', function(e) {
        e.preventDefault();

        const productCard = this.closest('.product-card');
        const productName = productCard.querySelector('h3').textContent;
        const productPrice = productCard.querySelector('.product-price').textContent;

        // Add to cart array (you can expand this to use localStorage)
        cart.push({
            name: productName,
            price: productPrice
        });

        // Visual feedback
        const originalText = this.textContent;
        this.textContent = 'Added! ✓';
        this.style.background = 'var(--primary-purple)';
        this.style.color = 'white';

        setTimeout(() => {
            this.textContent = originalText;
            this.style.background = '';
            this.style.color = '';
        }, 2000);

        // Show notification (you can make this fancier)
        showNotification(`${productName} added to cart!`);

        console.log('Cart:', cart);
    });
});

// ===========================
// NOTIFICATION SYSTEM
// ===========================

function showNotification(message) {
    // Remove existing notification if any
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: linear-gradient(135deg, var(--primary-purple), var(--dark-purple));
        color: white;
        padding: 1rem 2rem;
        border-radius: 5px;
        box-shadow: 0 10px 30px rgba(139, 92, 246, 0.4);
        z-index: 10000;
        animation: slideInRight 0.3s ease-out;
        font-family: 'Cinzel', serif;
        font-weight: 600;
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add animation styles for notification
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ===========================
// NEWSLETTER FORM
// ===========================

const newsletterForm = document.querySelector('.newsletter-form');

newsletterForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const emailInput = this.querySelector('input[type="email"]');
    const email = emailInput.value;

    if (email) {
        // Here you would typically send the email to your backend
        console.log('Newsletter signup:', email);

        showNotification('Welcome to the Coven! Check your email.');
        emailInput.value = '';
    }
});

// ===========================
// INTERSECTION OBSERVER FOR ANIMATIONS
// ===========================

const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.8s ease-out forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe elements for scroll animations
document.querySelectorAll('.featured-card, .product-card, .blog-card, .video-card').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
});

// ===========================
// QUICK VIEW FUNCTIONALITY
// ===========================

const quickViewButtons = document.querySelectorAll('.btn-quick-view');

quickViewButtons.forEach(button => {
    button.addEventListener('click', function(e) {
        e.stopPropagation();

        const productCard = this.closest('.product-card');
        const productName = productCard.querySelector('h3').textContent;
        const productDescription = productCard.querySelector('.product-description').textContent;
        const productPrice = productCard.querySelector('.product-price').textContent;
        const productImage = productCard.querySelector('.product-image img').src;

        // Create modal (simplified version - you can make this fancier)
        showQuickViewModal({
            name: productName,
            description: productDescription,
            price: productPrice,
            image: productImage
        });
    });
});

function showQuickViewModal(product) {
    // Remove existing modal if any
    const existingModal = document.querySelector('.quick-view-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'quick-view-modal';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <button class="modal-close">&times;</button>
            <div class="modal-body">
                <div class="modal-image">
                    <img src="${product.image}" alt="${product.name}">
                </div>
                <div class="modal-info">
                    <h2>${product.name}</h2>
                    <p class="modal-description">${product.description}</p>
                    <p class="modal-price">${product.price}</p>
                    <button class="btn btn-primary btn-add-to-cart">Add to Cart</button>
                </div>
            </div>
        </div>
    `;

    // Add modal styles
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10001;
        display: flex;
        justify-content: center;
        align-items: center;
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Close modal functionality
    const closeModal = () => {
        modal.remove();
        document.body.style.overflow = '';
    };

    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-overlay').addEventListener('click', closeModal);

    // Add to cart from modal
    modal.querySelector('.btn-add-to-cart').addEventListener('click', () => {
        showNotification(`${product.name} added to cart!`);
        closeModal();
    });
}

// Add modal styles
const modalStyle = document.createElement('style');
modalStyle.textContent = `
    .modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(5px);
    }

    .modal-content {
        position: relative;
        background: var(--bg-card);
        border: 2px solid var(--border-color);
        border-radius: 15px;
        max-width: 800px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        animation: fadeInUp 0.3s ease-out;
    }

    .modal-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: var(--text-light);
        font-size: 2rem;
        cursor: pointer;
        z-index: 1;
        width: 40px;
        height: 40px;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 50%;
        transition: all 0.3s ease;
    }

    .modal-close:hover {
        background: var(--primary-purple);
    }

    .modal-body {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2rem;
        padding: 2rem;
    }

    .modal-image img {
        width: 100%;
        border-radius: 10px;
    }

    .modal-info h2 {
        font-size: 2rem;
        margin-bottom: 1rem;
        color: var(--text-light);
    }

    .modal-description {
        color: var(--text-gray);
        font-size: 1.1rem;
        margin-bottom: 1.5rem;
        line-height: 1.6;
    }

    .modal-price {
        font-size: 2rem;
        color: var(--primary-purple);
        font-weight: 700;
        margin-bottom: 2rem;
    }

    @media (max-width: 768px) {
        .modal-body {
            grid-template-columns: 1fr;
        }
    }
`;
document.head.appendChild(modalStyle);

// ===========================
// VIDEO CARD CLICK HANDLERS
// ===========================

const videoCards = document.querySelectorAll('.video-card');

videoCards.forEach(card => {
    card.addEventListener('click', function() {
        // In a real implementation, you would open the video or navigate to it
        showNotification('Opening video...');
        console.log('Video clicked:', this.querySelector('h4').textContent);
    });
});

// ===========================
// CONSOLE MESSAGE
// ===========================

console.log('%c🌙 Welcome to GronderfulShops 🌙', 'color: #8b5cf6; font-size: 20px; font-weight: bold;');
console.log('%cMagic is real, and so is good code ✨', 'color: #c4b5fd; font-size: 14px;');

// ===========================
// AUTH NAVIGATION MANAGEMENT
// ===========================

import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Wait for DOM to be ready before setting up auth
document.addEventListener('DOMContentLoaded', () => {
    setupAuthNavigation();
});

function setupAuthNavigation() {
    // DOM elements
    const authNavGuest = document.getElementById('authNavGuest');
    const authNavUser = document.getElementById('authNavUser');
    const navUserBtn = document.getElementById('navUserBtn');
    const navUserName = document.getElementById('navUserName');
    const navUserAvatar = document.getElementById('navUserAvatar');
    const authDropdownMenu = document.getElementById('authDropdownMenu');
    const adminLink = document.getElementById('adminLink');
    const navSignOut = document.getElementById('navSignOut');

    // Check if elements exist
    if (!authNavGuest || !authNavUser) {
        console.warn('Auth navigation elements not found');
        return;
    }

    // Initialize auth state listener
    onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is logged in
        authNavGuest.style.display = 'none';
        authNavUser.style.display = 'flex';

        // Set user display name and clean up any duplicates
        let displayName = user.displayName || user.email?.split('@')[0] || 'Account';

        // Remove duplicate consecutive words (e.g., "curtis oneill oneill" -> "curtis oneill")
        // Split by space, filter out consecutive duplicates (case-insensitive)
        displayName = displayName.split(' ').filter((word, index, arr) => {
            if (index === 0) return true;
            return word.toLowerCase() !== arr[index - 1].toLowerCase();
        }).join(' ');

        navUserName.textContent = displayName;

        // Set user avatar (use photo URL if available, otherwise default emoji)
        if (user.photoURL) {
            navUserAvatar.innerHTML = `<img src="${user.photoURL}" alt="" style="width: 1.1rem; height: 1.1rem; border-radius: 50%; object-fit: cover;">`;
        } else {
            navUserAvatar.textContent = '👤';
        }

        // Check if user is admin and show admin link
        const token = await user.getIdToken();
        const idTokenResult = await user.getIdTokenResult();
        const userRole = idTokenResult.claims.role || 'customer';

        if (userRole === 'GronderfulBlogs') {
            adminLink.style.display = 'flex';
            adminLink.href = '/admin/index.html';
        } else {
            adminLink.style.display = 'none';
        }
    } else {
        // User is logged out
        authNavGuest.style.display = 'flex';
        authNavUser.style.display = 'none';
    }
    });

    // Dropdown toggle
    if (navUserBtn) {
        navUserBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            authDropdownMenu.classList.toggle('active');
            navUserBtn.parentElement.classList.toggle('active');
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (authDropdownMenu && !authDropdownMenu.contains(e.target) && !navUserBtn?.contains(e.target)) {
            authDropdownMenu.classList.remove('active');
            navUserBtn?.parentElement?.classList.remove('active');
        }
    });

    // Sign out handler
    if (navSignOut) {
        navSignOut.addEventListener('click', async () => {
            try {
                await signOut(auth);

                // Clear any local storage
                localStorage.removeItem('authToken');
                sessionStorage.removeItem('profilePromptShown');

                // Show notification
                showNotification('Signed out successfully ✨');

                // Close dropdown
                authDropdownMenu.classList.remove('active');
                navUserBtn?.parentElement?.classList.remove('active');

                // Redirect to home if on auth-required page
                if (window.location.pathname.includes('/preferences.html') ||
                    window.location.pathname.includes('/admin/')) {
                    setTimeout(() => {
                        window.location.href = '/index.html';
                    }, 1000);
                }
            } catch (error) {
                console.error('Sign out error:', error);
                showNotification('Error signing out. Please try again.');
            }
        });
    }
}
