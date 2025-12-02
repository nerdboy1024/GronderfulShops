/**
 * Setup API Key for Postmaster.Center Integration
 * Generates a .key file that can be imported into Postmaster.Center
 *
 * Run with: node scripts/setup-postmaster-key.js [sitename]
 *
 * Prerequisites:
 * - serviceAccountKey.json in project root
 * - Firebase project configured
 */

const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Get site name from config or use default
const SITE_NAME = process.env.SITE_NAME || 'mysite';
const PROJECT_ID = process.env.PROJECT_ID || 'your-project-id';

// Initialize Firebase Admin
let serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
    serviceAccountPath = path.join(__dirname, '..', 'functions', 'config', 'serviceAccountKey.json');
}

if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ serviceAccountKey.json not found!');
    console.error('   Place it in project root or functions/config/');
    process.exit(1);
}

const serviceAccount = require(serviceAccountPath);
const projectId = serviceAccount.project_id || PROJECT_ID;

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: projectId
});

const db = admin.firestore();

async function setupPostmasterKey() {
    try {
        const siteName = process.argv[2] || SITE_NAME;
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        console.log(`🔑 Setting up Postmaster.Center API Key for ${siteName}...\n`);

        // Generate a secure API key
        const apiKey = `gs_${crypto.randomBytes(32).toString('hex')}`;

        // Check if a postmaster key already exists for this site
        const existingKey = await db.collection('apiKeys')
            .where('name', '==', `Postmaster.Center - ${siteName}`)
            .limit(1)
            .get();

        let keyDocId;

        if (!existingKey.empty) {
            // Update existing key
            keyDocId = existingKey.docs[0].id;
            await db.collection('apiKeys').doc(keyDocId).update({
                key: apiKey,
                updatedAt: new Date(),
                isActive: true
            });
            console.log('✓ Updated existing Postmaster.Center API key');
        } else {
            // Create new key
            const keyDoc = await db.collection('apiKeys').add({
                name: `Postmaster.Center - ${siteName}`,
                key: apiKey,
                email: 'api@postmaster.center',
                isActive: true,
                permissions: ['read', 'write', 'delete'],
                allowedOrigins: ['postmaster.center', 'localhost'],
                createdAt: new Date(),
                updatedAt: new Date(),
                usageCount: 0,
                description: `API key for Postmaster.Center AI management - ${siteName}`
            });
            keyDocId = keyDoc.id;
            console.log('✓ Created new Postmaster.Center API key');
        }

        // Create the Postmaster import config
        const postmasterConfig = {
            name: siteName,
            type: "gronderful-shop",
            version: "1.0.0",
            connection: {
                apiUrl: `https://us-central1-${projectId}.cloudfunctions.net/api`,
                apiKey: apiKey,
                authMethod: "X-API-Key"
            },
            endpoints: {
                products: {
                    list: "GET /api/products",
                    create: "POST /api/products",
                    get: "GET /api/products/:id",
                    update: "PUT /api/products/:id",
                    patch: "PATCH /api/products/:id",
                    delete: "DELETE /api/products/:id"
                },
                categories: {
                    list: "GET /api/categories",
                    create: "POST /api/categories",
                    update: "PUT /api/categories/:id",
                    delete: "DELETE /api/categories/:id"
                },
                orders: {
                    list: "GET /api/orders",
                    get: "GET /api/orders/:id",
                    updateStatus: "PATCH /api/orders/:id/status"
                },
                reviews: {
                    list: "GET /api/reviews",
                    create: "POST /api/reviews",
                    approve: "PATCH /api/reviews/:id/approve",
                    delete: "DELETE /api/reviews/:id"
                },
                coupons: {
                    list: "GET /api/coupons",
                    create: "POST /api/coupons",
                    validate: "POST /api/coupons/validate",
                    delete: "DELETE /api/coupons/:id"
                },
                newsletter: {
                    list: "GET /api/newsletter",
                    subscribe: "POST /api/newsletter/subscribe"
                },
                wishlist: {
                    list: "GET /api/wishlist",
                    add: "POST /api/wishlist",
                    remove: "DELETE /api/wishlist/:productId"
                },
                health: "GET /api/health"
            },
            features: {
                shop: true,
                products: true,
                orders: true,
                reviews: true,
                coupons: true,
                newsletter: true,
                wishlist: true,
                recommendations: true,
                inventory: true
            },
            createdAt: new Date().toISOString()
        };

        // Generate filename: sitename_gronderfulshop_date.key
        const filename = `${siteName.toLowerCase().replace(/[^a-z0-9]/g, '')}_gronderfulshop_${date}.key`;
        const configPath = path.join(__dirname, '..', filename);

        fs.writeFileSync(configPath, JSON.stringify(postmasterConfig, null, 2));

        console.log(`\n✓ Config saved to: ${filename}`);
        console.log('\n' + '='.repeat(60));
        console.log('POSTMASTER.CENTER CONNECTION DETAILS');
        console.log('='.repeat(60));
        console.log(`\nSite Name: ${siteName}`);
        console.log(`API URL: ${postmasterConfig.connection.apiUrl}`);
        console.log(`API Key: ${apiKey}`);
        console.log(`Auth Header: X-API-Key`);
        console.log(`Key File: ${filename}`);
        console.log('\n' + '='.repeat(60));
        console.log('\n📋 Import the .key file into Postmaster.Center');
        console.log('   Or manually enter the API URL and Key above.\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error setting up API key:', error);
        process.exit(1);
    }
}

// Show usage if --help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage: node scripts/setup-postmaster-key.js [sitename]

Examples:
  node scripts/setup-postmaster-key.js chordevacave
  node scripts/setup-postmaster-key.js kpopanime
  node scripts/setup-postmaster-key.js "My Shop"

Output: sitename_gronderfulshop_YYYY-MM-DD.key
`);
    process.exit(0);
}

setupPostmasterKey();
