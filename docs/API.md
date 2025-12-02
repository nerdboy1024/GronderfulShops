# GronderfulShops - API Documentation

## Base URL

```
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api
```

## Authentication

### Firebase Token (User Login)
```
Authorization: Bearer <firebase-id-token>
```

### API Key (Remote Admin)
```
X-API-Key: your-api-key-here
```

---

## Products API

### List Products (Public)
```http
GET /api/products
```

Query Parameters:
- `category` - Filter by category slug
- `featured` - Filter featured products (true/false)
- `search` - Search in name/description
- `sort` - Sort field (createdAt, name, price, stockQuantity)
- `order` - Sort order (asc, desc)
- `limit` - Results per page (default: 20)
- `offset` - Pagination offset

### Get Product (Public)
```http
GET /api/products/:slug
```

### Create Product (Admin)
```http
POST /api/products
```
```json
{
  "name": "Product Name",
  "slug": "product-slug",
  "description": "Product description",
  "price": 29.99,
  "compareAtPrice": 39.99,
  "stockQuantity": 100,
  "categoryId": "category-id",
  "imageUrl": "https://...",
  "isFeatured": false
}
```

### Update Product (Admin)
```http
PUT /api/products/:id
PATCH /api/products/:id
```

### Update Specific Fields (Admin)
```http
PATCH /api/products/:id/title
PATCH /api/products/:id/description
PATCH /api/products/:id/price
PATCH /api/products/:id/stock
PATCH /api/products/:id/images
PATCH /api/products/:id/category
PATCH /api/products/:id/status
PATCH /api/products/:id/seo
```

### Delete Product (Admin)
```http
DELETE /api/products/:id
```

### Bulk Operations (Admin)
```http
POST /api/products/bulk/delete
POST /api/products/bulk/update
```

---

## Categories API

### List Categories (Public)
```http
GET /api/categories
```

### Create Category (Admin)
```http
POST /api/categories
```
```json
{
  "name": "Category Name",
  "slug": "category-slug",
  "description": "Category description",
  "imageUrl": "https://..."
}
```

---

## Orders API

### List Orders (Admin)
```http
GET /api/orders
```

### Get Order
```http
GET /api/orders/:id
```

### Update Order Status (Admin)
```http
PATCH /api/orders/:id/status
```
```json
{
  "status": "shipped",
  "trackingNumber": "TRACK123"
}
```

---

## Error Responses

```json
{
  "error": "ErrorType",
  "message": "Human readable message"
}
```

| Code | Error | Description |
|------|-------|-------------|
| 400 | ValidationError | Invalid input |
| 401 | Unauthorized | Missing/invalid auth |
| 403 | Forbidden | Insufficient permissions |
| 404 | NotFound | Resource not found |
| 409 | ConflictError | Resource already exists |
| 500 | ServerError | Internal error |

---

## JavaScript SDK Example

```javascript
class ShopAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api';
  }

  async request(endpoint, options = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    return response.json();
  }

  // Products
  async getProducts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/products?${query}`);
  }

  async createProduct(data) {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateProduct(id, data) {
    return this.request(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async deleteProduct(id) {
    return this.request(`/products/${id}`, { method: 'DELETE' });
  }
}

// Usage
const shop = new ShopAPI('your-api-key');
const products = await shop.getProducts({ featured: true });
```
