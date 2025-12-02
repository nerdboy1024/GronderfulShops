# 🛍️ GronderfulShops

**A complete, AI-friendly e-commerce and blog platform for Firebase.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Firebase](https://img.shields.io/badge/Firebase-Ready-orange?logo=firebase)](https://firebase.google.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)](https://nodejs.org/)

> **Perfect for AI-assisted development.** This project is designed to be easily installed by AI assistants like Claude, ChatGPT, or Copilot onto existing Firebase projects.

---

## ✨ Features

### 🛒 E-Commerce
- Product catalog with categories
- Shopping cart and checkout
- Order management
- Inventory tracking
- Discount coupons
- Product reviews & ratings
- Wishlist functionality

### 📝 Blog System
- Full blog with categories
- SEO-optimized posts
- Comment system with moderation
- Analytics tracking
- Related posts

### 🔐 Authentication & Security
- Firebase Authentication integration
- Role-based access control (Admin/Customer)
- API key authentication for remote access
- Rate limiting and CORS protection

### 📧 Marketing
- Newsletter subscriptions
- Product recommendations
- Recently viewed tracking

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [📖 README.md](README.md) | This file - project overview |
| [🚀 SETUP.md](docs/SETUP.md) | Complete installation guide for humans |
| [🤖 AI_INSTRUCTIONS_INSTALL.md](AI_INSTRUCTIONS_INSTALL.md) | Step-by-step guide for AI assistants |
| [📡 API.md](docs/API.md) | Full API reference documentation |
| [🗺️ ROADMAP.md](ROADMAP.md) | Future features and architecture guide |

---

## 🚀 Quick Start

### Option 1: AI-Assisted Installation (Recommended)

Simply ask your AI assistant:

> "Install GronderfulShops from github.com/[username]/gronderfulshops onto my Firebase project"

The AI will follow [AI_INSTRUCTIONS_INSTALL.md](AI_INSTRUCTIONS_INSTALL.md) to set everything up.

### Option 2: Manual Installation

```bash
# Clone the repository
git clone https://github.com/[username]/gronderfulshops.git
cd gronderfulshops

# Install dependencies
cd functions && npm install

# Configure Firebase (update config files with your project details)
# See docs/SETUP.md for detailed instructions

# Deploy
firebase deploy
```

---

## 🏗️ Project Structure

```
gronderfulshops/
├── 📁 frontend/public/      # Static frontend files
│   ├── admin/               # Admin panel
│   ├── index.html           # Main storefront
│   ├── blog.html            # Blog listing
│   ├── blog-post.html       # Individual blog posts
│   ├── product.html         # Product details
│   ├── cart.html            # Shopping cart
│   └── *.js, *.css          # Scripts and styles
│
├── 📁 functions/            # Firebase Cloud Functions
│   ├── config/              # Firebase configuration
│   ├── middleware/          # Auth middleware
│   ├── routes/              # API endpoints
│   │   ├── products.js      # Product CRUD
│   │   ├── blog.js          # Blog CRUD
│   │   ├── orders.js        # Order management
│   │   ├── auth.js          # Authentication
│   │   └── ...              # More endpoints
│   ├── index.js             # Cloud Functions entry
│   ├── server.js            # Express server
│   └── package.json
│
├── 📁 docs/                 # Documentation
│   ├── SETUP.md             # Setup guide
│   └── API.md               # API reference
│
├── firebase.json            # Firebase configuration
├── firestore.rules          # Security rules
├── firestore.indexes.json   # Database indexes
├── AI_INSTRUCTIONS_INSTALL.md  # AI installation guide
├── ROADMAP.md               # Future plans
└── README.md                # This file
```

---

## 🔌 API Overview

Base URL: `https://us-central1-YOUR_PROJECT.cloudfunctions.net/api`

### Authentication
```bash
# Firebase Token (user login)
Authorization: Bearer <firebase-token>

# API Key (remote admin)
X-API-Key: your-api-key
```

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/products` | GET | List all products |
| `/api/products` | POST | Create product (admin) |
| `/api/products/:id` | PATCH | Update product (admin) |
| `/api/blog` | GET | List blog posts |
| `/api/blog` | POST | Create post (admin) |
| `/api/orders` | GET | List orders |
| `/api/categories` | GET | List categories |

See [API.md](docs/API.md) for complete documentation.

---

## 🎯 Use Cases

### 1. Add Blog to Existing Site
Just need a blog? Copy only the blog-related files:
- `functions/routes/blog.js`
- `functions/routes/comments.js`
- `frontend/public/blog*.html`
- `frontend/public/blog*.js`

### 2. Full E-Commerce Platform
Deploy the entire project for a complete online store with blog.

### 3. Headless CMS
Use only the API backend with your own frontend framework (React, Vue, etc.)

### 4. Remote Product Management
Use API keys to manage products from external tools or admin panels.

---

## 🔧 Configuration

### Required Configuration Files

1. **`frontend/public/script-firebase.js`**
   ```javascript
   const firebaseConfig = {
       apiKey: "YOUR_API_KEY",
       projectId: "YOUR_PROJECT_ID",
       // ... other config
   };
   ```

2. **`functions/config/firebase.js`**
   ```javascript
   storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app'
   ```

3. **`functions/server.js`**
   ```javascript
   const allowedOrigins = [
       'https://YOUR_DOMAIN.com',
       'https://YOUR_PROJECT_ID.web.app'
   ];
   ```

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📄 License

MIT License - Use freely for personal or commercial projects.

---

## 🙏 Credits

Built with:
- [Firebase](https://firebase.google.com/) - Backend infrastructure
- [Express.js](https://expressjs.com/) - API framework
- [Node.js](https://nodejs.org/) - Runtime

---

## 💬 Support

- 📖 Check [docs/SETUP.md](docs/SETUP.md) for installation help
- 🐛 Open an issue for bugs
- 💡 Open an issue for feature requests

---

**Made with ❤️ for the AI-assisted development community**
