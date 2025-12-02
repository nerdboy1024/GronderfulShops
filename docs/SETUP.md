# GronderfulShops - Setup Guide

## Prerequisites

1. Node.js v20 or higher
2. Firebase CLI (`npm install -g firebase-tools`)
3. A Firebase project

## Quick Start

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (e.g., "gronderfulshops")
3. Enable Firestore Database
4. Enable Firebase Authentication (Email/Password)
5. Enable Firebase Hosting

### 2. Configure Firebase

```bash
# Login to Firebase
firebase login

# Initialize project (select existing project)
firebase init

# Select: Firestore, Functions, Hosting
```

### 3. Update Configuration

Replace placeholders in these files:

**frontend/public/firebase-config.js:**
```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

**frontend/public/script-firebase.js:**
- Update `firebaseConfig` with your credentials
- Update `API_BASE_URL` with your Cloud Functions URL

**functions/config/firebase.js:**
- Update `storageBucket` with your bucket name

**functions/server.js:**
- Update `allowedOrigins` with your domains

### 4. Install Dependencies

```bash
cd functions
npm install
```

### 5. Deploy

```bash
# Deploy everything
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting
```

### 6. Create Admin User

After deployment, create your first admin user:

1. Sign up through the app
2. Use Firebase Console to update user role in Firestore:
   - Go to Firestore > users > [your-user-id]
   - Set `role: "admin"`

### 7. Create API Key (Optional)

For remote admin access, create an API key in Firestore:

```javascript
// In Firestore: apiKeys collection
{
    "key": "your-secure-api-key-here",
    "name": "Admin Access",
    "email": "admin@gronderfulshops.com",
    "isActive": true,
    "allowedOrigins": ["your-domain.com", "localhost"],
    "permissions": ["read", "write", "delete"],
    "createdAt": Timestamp,
    "expiresAt": null,
    "usageCount": 0
}
```

## Project Structure

```
gronderfulShops/
├── frontend/
│   └── public/           # Static frontend files
├── functions/
│   ├── config/           # Firebase configuration
│   ├── middleware/       # Auth middleware
│   ├── routes/           # API routes
│   ├── index.js          # Cloud Functions entry
│   ├── server.js         # Express server
│   └── package.json
├── docs/                 # Documentation
├── firebase.json         # Firebase config
├── firestore.rules       # Security rules
└── firestore.indexes.json # Firestore indexes
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/products` | Products CRUD |
| `/api/categories` | Categories CRUD |
| `/api/orders` | Order management |
| `/api/auth` | Authentication |
| `/api/users` | User management |
| `/api/blog` | Blog posts |
| `/api/reviews` | Product reviews |
| `/api/coupons` | Discount coupons |
| `/api/newsletter` | Newsletter subscriptions |

## Environment Variables

Create `functions/.env`:

```env
NODE_ENV=production
FRONTEND_URL=https://your-domain.com
```

## Customization

### Branding
- Update `frontend/public/index.html` with your branding
- Replace favicon files in `frontend/public/favicon/`
- Update `site.webmanifest`

### Styling
- Modify `frontend/public/styles.css` for your theme

### Features
- Add/remove routes in `functions/server.js`
- Customize API endpoints in `functions/routes/`

## Support

For issues, please check the documentation or open an issue.
