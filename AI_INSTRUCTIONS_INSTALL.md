# AI Installation Instructions for GronderfulShops

> **For AI Assistants:** This document contains step-by-step instructions for installing GronderfulShops on an existing Firebase project. Follow these instructions precisely.

---

## Pre-Installation Checklist

Before starting, verify the user has:

- [ ] An existing Firebase project
- [ ] Firebase CLI installed (`firebase --version`)
- [ ] Node.js v20+ installed
- [ ] Firebase Firestore enabled
- [ ] Firebase Authentication enabled (Email/Password)
- [ ] Firebase Hosting enabled (optional but recommended)

---

## Step 1: Gather Firebase Configuration

Ask the user for their Firebase configuration. They can find it at:
**Firebase Console → Project Settings → Your Apps → Web App → Config**

Required values:
```javascript
{
  apiKey: "...",
  authDomain: "PROJECT_ID.firebaseapp.com",
  projectId: "PROJECT_ID",
  storageBucket: "PROJECT_ID.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
}
```

Store these values - you'll need them for configuration.

---

## Step 2: Copy Backend Files

### 2.1 Create Functions Directory Structure

```bash
mkdir -p functions/routes functions/middleware functions/config
```

### 2.2 Copy Required Files

Copy these files from GronderfulShops to the user's project:

**Core Files:**
- `functions/index.js`
- `functions/server.js`
- `functions/package.json`

**Config:**
- `functions/config/firebase.js`

**Middleware:**
- `functions/middleware/auth.js`

**Routes (copy all or select what's needed):**
- `functions/routes/products.js` - Product catalog
- `functions/routes/categories.js` - Product categories
- `functions/routes/blog.js` - Blog system
- `functions/routes/orders.js` - Order management
- `functions/routes/auth.js` - Authentication
- `functions/routes/users.js` - User management
- `functions/routes/reviews.js` - Product reviews
- `functions/routes/comments.js` - Blog comments
- `functions/routes/coupons.js` - Discount coupons
- `functions/routes/wishlist.js` - User wishlists
- `functions/routes/newsletter.js` - Email subscriptions
- `functions/routes/recommendations.js` - Product recommendations
- `functions/routes/admin.js` - Admin endpoints

---

## Step 3: Configure Firebase

### 3.1 Update `functions/config/firebase.js`

Replace the storage bucket with the user's bucket:

```javascript
let initConfig = {
    storageBucket: 'USER_PROJECT_ID.firebasestorage.app'
};
```

### 3.2 Update `functions/server.js`

Update the CORS allowed origins:

```javascript
const allowedOrigins = [
    'http://localhost:8081',
    'http://localhost:3000',
    'https://USER_DOMAIN.com',
    'https://USER_PROJECT_ID.web.app',
    'https://USER_PROJECT_ID.firebaseapp.com',
    process.env.FRONTEND_URL
].filter(Boolean);
```

### 3.3 Update API Message

In `functions/server.js`, update the API root message:

```javascript
app.get('/api', (req, res) => {
    res.json({
        message: 'USER_SITE_NAME API',
        version: '1.0.0',
        // ... endpoints
    });
});
```

---

## Step 4: Install Dependencies

```bash
cd functions
npm install
```

---

## Step 5: Copy Firestore Configuration

### 5.1 Copy or Merge `firestore.rules`

If user has existing rules, merge them. Otherwise, copy the full file.

**Key rules to add:**
```javascript
// Products - public read, admin write
match /products/{productId} {
  allow read: if true;
  allow write: if isAdmin();
}

// Blog - public read, admin write
match /blog/{postId} {
  allow read: if true;
  allow write: if isAdmin();
}

// API Keys - admin only
match /apiKeys/{keyId} {
  allow read, write: if isAdmin();
}
```

### 5.2 Copy or Merge `firestore.indexes.json`

Add required indexes for queries. Critical indexes:

```json
{
  "collectionGroup": "products",
  "fields": [
    { "fieldPath": "isActive", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "blog",
  "fields": [
    { "fieldPath": "isPublished", "order": "ASCENDING" },
    { "fieldPath": "publishedAt", "order": "DESCENDING" }
  ]
}
```

---

## Step 6: Update firebase.json

Add or merge the functions and hosting rewrites:

```json
{
  "functions": {
    "source": "functions"
  },
  "hosting": {
    "rewrites": [
      {
        "source": "/api/**",
        "function": "api"
      }
    ]
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

---

## Step 7: Copy Frontend Files (Optional)

If user wants the frontend components:

### 7.1 For Blog Only

Copy:
- `frontend/public/blog.html`
- `frontend/public/blog.js`
- `frontend/public/blog-post.html`
- `frontend/public/blog-post.js`

### 7.2 For Full Shop

Copy the entire `frontend/public/` directory.

### 7.3 Update Frontend Firebase Config

In `script-firebase.js`, replace:

```javascript
const firebaseConfig = {
    apiKey: "USER_API_KEY",
    authDomain: "USER_PROJECT_ID.firebaseapp.com",
    projectId: "USER_PROJECT_ID",
    storageBucket: "USER_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "USER_SENDER_ID",
    appId: "USER_APP_ID"
};

const API_BASE_URL = 'https://us-central1-USER_PROJECT_ID.cloudfunctions.net/api';
```

---

## Step 8: Deploy

```bash
# Deploy everything
firebase deploy

# Or deploy individually
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only hosting
```

---

## Step 9: Create Admin User

After deployment:

1. User signs up through the app or Firebase Console
2. In Firestore Console, navigate to `users` collection
3. Find the user document
4. Add field: `role: "admin"`

---

## Step 10: Create API Key (For Remote Access)

If user needs remote API access:

1. Go to Firestore Console
2. Create document in `apiKeys` collection:

```javascript
{
  key: "GENERATE_SECURE_RANDOM_STRING",  // Use: crypto.randomUUID() or similar
  name: "Admin API Key",
  email: "admin@usersite.com",
  isActive: true,
  allowedOrigins: ["usersite.com", "localhost"],
  permissions: ["read", "write", "delete"],
  createdAt: SERVER_TIMESTAMP,
  expiresAt: null,
  usageCount: 0,
  lastUsedAt: null
}
```

---

## Verification Steps

After installation, verify:

1. **API Health Check:**
   ```bash
   curl https://us-central1-PROJECT_ID.cloudfunctions.net/api/health
   ```
   Expected: `{"status":"ok",...}`

2. **Products Endpoint:**
   ```bash
   curl https://us-central1-PROJECT_ID.cloudfunctions.net/api/products
   ```
   Expected: `{"products":[],"pagination":{...}}`

3. **Admin Access (with API key):**
   ```bash
   curl -X POST https://us-central1-PROJECT_ID.cloudfunctions.net/api/products \
     -H "X-API-Key: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"name":"Test","slug":"test","price":9.99}'
   ```

---

## Troubleshooting

### CORS Errors
- Check `allowedOrigins` in `server.js`
- Ensure origin includes protocol (https://)

### 401 Unauthorized
- Verify API key exists in Firestore
- Check `isActive: true`
- Verify `X-API-Key` header spelling

### Function Deploy Fails
- Run `npm install` in functions/
- Check Node version (needs v20)
- Check `firebase-functions` version

### Firestore Permission Denied
- Deploy firestore rules: `firebase deploy --only firestore:rules`
- Check user has admin role in Firestore

---

## Minimal Blog-Only Installation

For users who only want the blog system:

1. Copy only:
   - `functions/routes/blog.js`
   - `functions/routes/comments.js`
   - `functions/middleware/auth.js`
   - `functions/config/firebase.js`

2. Update `server.js` to only include:
   ```javascript
   const blogRoutes = require('./routes/blog');
   const commentRoutes = require('./routes/comments');

   app.use('/api/blog', blogRoutes);
   app.use('/api/comments', commentRoutes);
   ```

3. Copy frontend:
   - `blog.html`, `blog.js`
   - `blog-post.html`, `blog-post.js`

---

## Quick Reference: File Purposes

| File | Purpose |
|------|---------|
| `index.js` | Cloud Functions entry point |
| `server.js` | Express app setup, middleware, routes |
| `config/firebase.js` | Firebase Admin SDK initialization |
| `middleware/auth.js` | JWT + API key authentication |
| `routes/*.js` | API endpoint handlers |
| `firestore.rules` | Database security rules |
| `firestore.indexes.json` | Query optimization indexes |

---

## AI Assistant Notes

- Always ask for Firebase config before starting
- Verify existing files before overwriting
- Merge rules/indexes if user has existing ones
- Test API health endpoint after deployment
- Create admin user for the client
- Generate secure API key if remote access needed
- Document any customizations made
