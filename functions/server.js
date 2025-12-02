const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const orderRoutes = require('./routes/orders');
const reviewRoutes = require('./routes/reviews');
const couponRoutes = require('./routes/coupons');
const wishlistRoutes = require('./routes/wishlist');
const newsletterRoutes = require('./routes/newsletter');
const recommendationRoutes = require('./routes/recommendations');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

// Import Firebase
const { admin, db } = require('./config/firebase');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 5000;

// ===========================
// MIDDLEWARE
// ===========================

// Trust proxy for Firebase Functions
app.set('trust proxy', true);

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration - TODO: Update with your domains
const allowedOrigins = [
    'http://localhost:8081',
    'http://localhost:3000',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:3000',
    'https://gronderfulshops.com',           // Production custom domain
    'https://YOUR_PROJECT_ID.web.app',       // Firebase hosting domain
    'https://YOUR_PROJECT_ID.firebaseapp.com', // Firebase app domain
    process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
};
app.use(cors(corsOptions));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logging middleware (development)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.path}`, {
            body: req.body,
            query: req.query
        });
        next();
    });
}

// ===========================
// API ROUTES
// ===========================

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});

// Root endpoint
app.get('/api', (req, res) => {
    res.json({
        message: 'GronderfulShops API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            products: '/api/products',
            categories: '/api/categories',
            orders: '/api/orders',
            users: '/api/users',
            admin: '/api/admin'
        }
    });
});

// ===========================
// ERROR HANDLING
// ===========================

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);

    // Don't leak error details in production
    const message = process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message;

    res.status(err.status || 500).json({
        error: err.name || 'ServerError',
        message: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ===========================
// EXPORT FOR CLOUD FUNCTIONS
// ===========================

module.exports = app;
