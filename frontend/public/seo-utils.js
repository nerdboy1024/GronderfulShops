// SEO Utilities for GronderfulBlogs
// Provides structured data, meta tags, and SEO enhancements

const SEO = {
    siteUrl: 'https://YOUR_DOMAIN.com',
    siteName: 'GronderfulBlogs',
    defaultImage: 'https://YOUR_DOMAIN.com/favicon/android-chrome-512x512.png',
    defaultDescription: 'A powerful, AI-friendly blog platform built on Firebase. Easy setup, seamless integration.',
    twitterHandle: '@YOUR_DOMAIN',

    /**
     * Add or update a meta tag
     */
    setMetaTag(name, content, property = false) {
        if (!content) return;

        const attribute = property ? 'property' : 'name';
        let meta = document.querySelector(`meta[${attribute}="${name}"]`);

        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute(attribute, name);
            document.head.appendChild(meta);
        }

        meta.setAttribute('content', content);
    },

    /**
     * Set canonical URL
     */
    setCanonical(url) {
        let canonical = document.querySelector('link[rel="canonical"]');

        if (!canonical) {
            canonical = document.createElement('link');
            canonical.setAttribute('rel', 'canonical');
            document.head.appendChild(canonical);
        }

        canonical.setAttribute('href', url);
    },

    /**
     * Add JSON-LD structured data
     */
    addStructuredData(data) {
        // Remove existing structured data script if any
        const existingScript = document.querySelector('script[type="application/ld+json"]');
        if (existingScript) {
            existingScript.remove();
        }

        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(data);
        document.head.appendChild(script);
    },

    /**
     * Generate Blog Post (Article) structured data
     */
    generateBlogPostSchema(post) {
        const publishedDate = post.publishedAt || post.createdAt;
        const modifiedDate = post.updatedAt || publishedDate;

        return {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": post.title,
            "description": post.excerpt || post.seo?.metaDescription || '',
            "image": post.featuredImage || this.defaultImage,
            "author": {
                "@type": "Person",
                "name": post.authorName || "Admin",
                "url": `${this.siteUrl}/index.html#about`
            },
            "publisher": {
                "@type": "Organization",
                "name": this.siteName,
                "logo": {
                    "@type": "ImageObject",
                    "url": `${this.siteUrl}/favicon/android-chrome-512x512.png`
                }
            },
            "datePublished": publishedDate,
            "dateModified": modifiedDate,
            "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": `${this.siteUrl}/blog-post.html?slug=${post.slug}`
            },
            "keywords": post.tags ? post.tags.join(', ') : '',
            "articleSection": post.category || 'Occult & Mysticism'
        };
    },

    /**
     * Generate Product structured data
     */
    generateProductSchema(product) {
        const schema = {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": product.name,
            "description": product.description || '',
            "image": product.images || product.image || this.defaultImage,
            "brand": {
                "@type": "Brand",
                "name": this.siteName
            },
            "offers": {
                "@type": "Offer",
                "url": `${this.siteUrl}/index.html#shop`,
                "priceCurrency": "USD",
                "price": product.price || product.salePrice || "0.00",
                "availability": product.stock > 0
                    ? "https://schema.org/InStock"
                    : "https://schema.org/OutOfStock",
                "seller": {
                    "@type": "Organization",
                    "name": this.siteName
                }
            }
        };

        // Add optional fields if available
        if (product.sku) {
            schema.sku = product.sku;
        }

        if (product.categories) {
            schema.category = product.categories;
        }

        return schema;
    },

    /**
     * Set complete SEO for blog post
     */
    setBlogPostSEO(post) {
        const pageUrl = `${this.siteUrl}/blog-post.html?slug=${post.slug}`;
        const imageUrl = post.featuredImage || this.defaultImage;
        const description = post.excerpt || post.seo?.metaDescription || this.defaultDescription;

        // Basic meta tags
        this.setMetaTag('description', description);
        this.setMetaTag('keywords', post.tags ? post.tags.join(', ') : 'blog, tarot, occult, crystals');

        // Open Graph tags
        this.setMetaTag('og:type', 'article', true);
        this.setMetaTag('og:url', pageUrl, true);
        this.setMetaTag('og:title', post.title, true);
        this.setMetaTag('og:description', description, true);
        this.setMetaTag('og:image', imageUrl, true);
        this.setMetaTag('og:site_name', this.siteName, true);

        // Twitter Card tags
        this.setMetaTag('twitter:card', 'summary_large_image');
        this.setMetaTag('twitter:site', this.twitterHandle);
        this.setMetaTag('twitter:creator', this.twitterHandle);
        this.setMetaTag('twitter:title', post.title);
        this.setMetaTag('twitter:description', description);
        this.setMetaTag('twitter:image', imageUrl);

        // Article-specific Open Graph tags
        if (post.publishedAt || post.createdAt) {
            this.setMetaTag('article:published_time', post.publishedAt || post.createdAt, true);
        }
        if (post.updatedAt) {
            this.setMetaTag('article:modified_time', post.updatedAt, true);
        }
        if (post.category) {
            this.setMetaTag('article:section', post.category, true);
        }
        if (post.tags) {
            post.tags.forEach(tag => {
                const meta = document.createElement('meta');
                meta.setAttribute('property', 'article:tag');
                meta.setAttribute('content', tag);
                document.head.appendChild(meta);
            });
        }

        // Canonical URL
        this.setCanonical(pageUrl);

        // Structured Data
        this.addStructuredData(this.generateBlogPostSchema(post));
    },

    /**
     * Set complete SEO for product
     */
    setProductSEO(product) {
        const imageUrl = product.images?.[0] || product.image || this.defaultImage;
        const description = product.description || this.defaultDescription;

        // Open Graph tags
        this.setMetaTag('og:type', 'product', true);
        this.setMetaTag('og:title', product.name, true);
        this.setMetaTag('og:description', description, true);
        this.setMetaTag('og:image', imageUrl, true);
        this.setMetaTag('og:site_name', this.siteName, true);

        // Product-specific Open Graph tags
        this.setMetaTag('product:price:amount', product.price || product.salePrice, true);
        this.setMetaTag('product:price:currency', 'USD', true);
        this.setMetaTag('product:availability', product.stock > 0 ? 'in stock' : 'out of stock', true);

        // Twitter Card tags
        this.setMetaTag('twitter:card', 'summary_large_image');
        this.setMetaTag('twitter:site', this.twitterHandle);
        this.setMetaTag('twitter:title', product.name);
        this.setMetaTag('twitter:description', description);
        this.setMetaTag('twitter:image', imageUrl);

        // Structured Data
        this.addStructuredData(this.generateProductSchema(product));
    },

    /**
     * Set homepage SEO with organization schema
     */
    setHomepageSEO() {
        const pageUrl = this.siteUrl;

        // Organization Schema
        const organizationSchema = {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": this.siteName,
            "url": this.siteUrl,
            "logo": `${this.siteUrl}/favicon/android-chrome-512x512.png`,
            "description": this.defaultDescription,
            "sameAs": [
                "https://www.youtube.com/channel/UC6iQFHx8Lr2VCH7s25ifhDg",
                "https://github.com/YOUR_GITHUB",
                "https://github.com/YOUR_GITHUB"
            ],
            "contactPoint": {
                "@type": "ContactPoint",
                "contactType": "Customer Service",
                "url": `${this.siteUrl}/index.html#about`
            }
        };

        // Website Schema
        const websiteSchema = {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": this.siteName,
            "url": this.siteUrl,
            "description": this.defaultDescription,
            "publisher": {
                "@type": "Organization",
                "name": this.siteName
            }
        };

        // Add both schemas as an array
        this.addStructuredData([organizationSchema, websiteSchema]);

        // Meta tags
        this.setMetaTag('description', this.defaultDescription);
        this.setMetaTag('og:type', 'website', true);
        this.setMetaTag('og:url', pageUrl, true);
        this.setMetaTag('og:title', `${this.siteName} - Mystical Treasures & Dark Magic`, true);
        this.setMetaTag('og:description', this.defaultDescription, true);
        this.setMetaTag('og:image', this.defaultImage, true);
        this.setMetaTag('og:site_name', this.siteName, true);

        // Twitter Card
        this.setMetaTag('twitter:card', 'summary_large_image');
        this.setMetaTag('twitter:site', this.twitterHandle);
        this.setMetaTag('twitter:title', `${this.siteName} - Mystical Treasures & Dark Magic`);
        this.setMetaTag('twitter:description', this.defaultDescription);
        this.setMetaTag('twitter:image', this.defaultImage);

        // Canonical
        this.setCanonical(pageUrl);
    },

    /**
     * Set blog list page SEO
     */
    setBlogListSEO() {
        const pageUrl = `${this.siteUrl}/blog.html`;
        const description = 'Explore Blog posts, tarot wisdom, developer resources from GronderfulBlogs.';

        // BreadcrumbList schema for blog
        const breadcrumbSchema = {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "Home",
                    "item": this.siteUrl
                },
                {
                    "@type": "ListItem",
                    "position": 2,
                    "name": "Blog",
                    "item": pageUrl
                }
            ]
        };

        this.addStructuredData(breadcrumbSchema);

        // Meta tags
        this.setMetaTag('description', description);
        this.setMetaTag('og:type', 'website', true);
        this.setMetaTag('og:url', pageUrl, true);
        this.setMetaTag('og:title', `Blog - ${this.siteName}`, true);
        this.setMetaTag('og:description', description, true);
        this.setMetaTag('og:image', this.defaultImage, true);

        // Twitter Card
        this.setMetaTag('twitter:card', 'summary_large_image');
        this.setMetaTag('twitter:site', this.twitterHandle);
        this.setMetaTag('twitter:title', `Blog - ${this.siteName}`);
        this.setMetaTag('twitter:description', description);
        this.setMetaTag('twitter:image', this.defaultImage);

        // Canonical
        this.setCanonical(pageUrl);
    },

    /**
     * Generate FAQ schema for AI search engines
     */
    generateFAQSchema(faqs) {
        return {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": faqs.map(faq => ({
                "@type": "Question",
                "name": faq.question,
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": faq.answer
                }
            }))
        };
    },

    /**
     * Generate HowTo schema for tutorials and guides
     */
    generateHowToSchema(howTo) {
        return {
            "@context": "https://schema.org",
            "@type": "HowTo",
            "name": howTo.name,
            "description": howTo.description,
            "image": howTo.image,
            "totalTime": howTo.totalTime,
            "step": howTo.steps.map((step, index) => ({
                "@type": "HowToStep",
                "position": index + 1,
                "name": step.name,
                "text": step.text,
                "image": step.image,
                "url": step.url
            }))
        };
    },

    /**
     * Add Speakable schema for voice search (Google Assistant, Alexa, etc.)
     */
    addSpeakableSchema(selectors = ['h1', 'h2', '.post-content p']) {
        return {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "speakable": {
                "@type": "SpeakableSpecification",
                "cssSelector": selectors
            }
        };
    },

    /**
     * Enhanced Blog Post SEO for AI search engines
     */
    setBlogPostSEOWithAI(post) {
        // First apply standard SEO
        this.setBlogPostSEO(post);

        // Add AI-specific enhancements
        const schemas = [this.generateBlogPostSchema(post)];

        // Add FAQ schema if post has FAQs
        if (post.faqs && post.faqs.length > 0) {
            schemas.push(this.generateFAQSchema(post.faqs));
        }

        // Add HowTo schema if it's a tutorial
        if (post.howTo) {
            schemas.push(this.generateHowToSchema(post.howTo));
        }

        // Add Speakable for voice search
        schemas.push(this.addSpeakableSchema([
            '.post-title',
            '.post-content h2',
            '.post-content h3',
            '.post-content p'
        ]));

        // Update structured data with all schemas
        this.addStructuredData(schemas);

        // Add AI-specific meta tags
        this.setMetaTag('robots', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');

        // Add language tag for better AI understanding
        if (!document.documentElement.lang) {
            document.documentElement.lang = 'en';
        }
    },

    /**
     * Add E-E-A-T signals (Experience, Expertise, Authoritativeness, Trustworthiness)
     * Important for AI search ranking
     */
    addEEATSignals(authorInfo) {
        const authorSchema = {
            "@context": "https://schema.org",
            "@type": "Person",
            "name": authorInfo.name || "Admin",
            "url": authorInfo.url || `${this.siteUrl}/index.html#about`,
            "description": authorInfo.bio || "Practitioner of the craft, tarot reader, and crystal enthusiast dedicated to exploring the hidden wisdom of the universe.",
            "sameAs": authorInfo.socialLinks || [
                "https://www.youtube.com/channel/UC6iQFHx8Lr2VCH7s25ifhDg",
                "https://github.com/YOUR_GITHUB"
            ],
            "knowsAbout": authorInfo.expertise || [
                "Tarot Reading",
                "Crystal Healing",
                "Occult Practices",
                "Spell Crafting",
                "Lunar Magic"
            ]
        };

        return authorSchema;
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SEO;
}
