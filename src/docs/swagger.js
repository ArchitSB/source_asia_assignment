const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Source Asia Backend API',
      version: '1.0.0',
      description: `
A production-quality HTTP service with two parts:
- **Part 1**: Rate-limited request API (5 requests/min per user, fixed window)
- **Part 2**: Product catalog with separate media management and pagination

Built with Node.js + Express.js. In-memory storage only.
      `,
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development server',
      },
    ],
    tags: [
      {
        name: 'Rate Limiter',
        description: 'Part 1 — Rate limited request endpoints',
      },
      {
        name: 'Products',
        description: 'Part 2 — Product catalog endpoints',
      },
    ],
    paths: {
      '/request': {
        post: {
          tags: ['Rate Limiter'],
          summary: 'Submit a rate-limited request',
          description: 'Accepts up to 5 requests per user per fixed 1-minute window. Returns 429 when limit is exceeded.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['user_id', 'payload'],
                  properties: {
                    user_id: {
                      type: 'string',
                      description: 'Required, non-empty string. Max 256 characters.',
                      example: 'alice',
                    },
                    payload: {
                      description: 'Any valid JSON value (object, string, number, boolean, null)',
                      example: { action: 'buy', item: 'widget' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Request accepted within rate limit',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'accepted' },
                      message: { type: 'string', example: 'Request accepted' },
                      user_id: { type: 'string', example: 'alice' },
                      accepted_in_window: { type: 'integer', example: 1 },
                    },
                  },
                },
              },
            },
            429: {
              description: 'Rate limit exceeded',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'rejected' },
                      error: { type: 'string', example: 'Rate limit exceeded' },
                      message: { type: 'string', example: 'Maximum 5 requests per minute allowed per user' },
                      user_id: { type: 'string', example: 'alice' },
                      retry_after_seconds: { type: 'integer', example: 42 },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Invalid input',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BadRequest' },
                },
              },
            },
          },
        },
      },
      '/stats': {
        get: {
          tags: ['Rate Limiter'],
          summary: 'Get rate limiter statistics',
          description: 'Returns per-user accepted/rejected counts and global totals. Accepted count is per current window. Rejected count is cumulative across all windows.',
          responses: {
            200: {
              description: 'Statistics returned successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      users: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            user_id: { type: 'string', example: 'alice' },
                            accepted_in_window: { type: 'integer', example: 5 },
                            rejected_cumulative: { type: 'integer', example: 3 },
                            window_started_at: { type: 'string', format: 'date-time', example: '2024-01-01T12:00:00.000Z' },
                          },
                        },
                      },
                      global: {
                        type: 'object',
                        properties: {
                          total_accepted_in_window: { type: 'integer', example: 5 },
                          total_rejected_cumulative: { type: 'integer', example: 3 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/products': {
        post: {
          tags: ['Products'],
          summary: 'Create a new product',
          description: 'Creates a product with optional image and video URLs. SKU must be unique.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateProductInput' },
              },
            },
          },
          responses: {
            201: {
              description: 'Product created successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ProductDetail' },
                },
              },
            },
            400: {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BadRequest' },
                },
              },
            },
            409: {
              description: 'Duplicate SKU',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: { type: 'string', example: 'Conflict' },
                      message: { type: 'string', example: 'A product with this SKU already exists' },
                    },
                  },
                },
              },
            },
          },
        },
        get: {
          tags: ['Products'],
          summary: 'List products (paginated)',
          description: 'Returns paginated list of products. Does NOT include image_urls or video_urls — use GET /products/:id for full details. Default limit: 20, max: 100.',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              description: 'Number of products to return (default: 20, max: 100)',
              schema: { type: 'integer', default: 20, maximum: 100, minimum: 1 },
            },
            {
              name: 'offset',
              in: 'query',
              description: 'Number of products to skip (default: 0)',
              schema: { type: 'integer', default: 0, minimum: 0 },
            },
          ],
          responses: {
            200: {
              description: 'Products listed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      products: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ProductListItem' },
                      },
                      pagination: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer', example: 100 },
                          limit: { type: 'integer', example: 20 },
                          offset: { type: 'integer', example: 0 },
                          has_more: { type: 'boolean', example: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Invalid pagination parameters',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BadRequest' },
                },
              },
            },
          },
        },
      },
      '/products/{id}': {
        get: {
          tags: ['Products'],
          summary: 'Get product by ID',
          description: 'Returns full product detail including all image_urls and video_urls arrays.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Product UUID',
              schema: { type: 'string', example: 'uuid-here' },
            },
          ],
          responses: {
            200: {
              description: 'Product found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ProductDetail' },
                },
              },
            },
            404: {
              description: 'Product not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/NotFound' },
                },
              },
            },
          },
        },
      },
      '/products/{id}/media': {
        post: {
          tags: ['Products'],
          summary: 'Append media URLs to a product',
          description: 'Appends new image and/or video URLs to an existing product. At least one URL must be provided. Max 20 URLs per array per request.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Product UUID',
              schema: { type: 'string', example: 'uuid-here' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'At least one of image_urls or video_urls must be provided and non-empty',
                  properties: {
                    image_urls: {
                      type: 'array',
                      items: { type: 'string', format: 'uri' },
                      maxItems: 20,
                      example: ['https://cdn.example.com/products/sku-001/img-2.jpg'],
                    },
                    video_urls: {
                      type: 'array',
                      items: { type: 'string', format: 'uri' },
                      maxItems: 20,
                      example: ['https://cdn.example.com/products/sku-001/demo-2.mp4'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Media appended successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ProductDetail' },
                },
              },
            },
            400: {
              description: 'No URLs provided or invalid URLs',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BadRequest' },
                },
              },
            },
            404: {
              description: 'Product not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/NotFound' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        CreateProductInput: {
          type: 'object',
          required: ['name', 'sku'],
          properties: {
            name: {
              type: 'string',
              description: 'Required, non-empty. Max 500 characters.',
              example: 'Widget A',
            },
            sku: {
              type: 'string',
              description: 'Required, non-empty, unique. Max 100 characters.',
              example: 'SKU-001',
            },
            image_urls: {
              type: 'array',
              items: { type: 'string', format: 'uri' },
              maxItems: 20,
              description: 'Optional. Max 20 URLs. Each must be http:// or https://, max 2048 chars.',
              example: ['https://cdn.example.com/products/sku-001/img-1.jpg'],
            },
            video_urls: {
              type: 'array',
              items: { type: 'string', format: 'uri' },
              maxItems: 20,
              description: 'Optional. Max 20 URLs. Each must be http:// or https://, max 2048 chars.',
              example: ['https://cdn.example.com/products/sku-001/demo.mp4'],
            },
          },
        },
        ProductListItem: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'uuid-here' },
            name: { type: 'string', example: 'Widget A' },
            sku: { type: 'string', example: 'SKU-001' },
            image_count: { type: 'integer', example: 2 },
            video_count: { type: 'integer', example: 1 },
            created_at: { type: 'string', format: 'date-time', example: '2024-01-01T12:00:00.000Z' },
          },
        },
        ProductDetail: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'uuid-here' },
            name: { type: 'string', example: 'Widget A' },
            sku: { type: 'string', example: 'SKU-001' },
            image_count: { type: 'integer', example: 2 },
            video_count: { type: 'integer', example: 1 },
            created_at: { type: 'string', format: 'date-time', example: '2024-01-01T12:00:00.000Z' },
            image_urls: {
              type: 'array',
              items: { type: 'string', format: 'uri' },
              example: ['https://cdn.example.com/products/sku-001/img-1.jpg'],
            },
            video_urls: {
              type: 'array',
              items: { type: 'string', format: 'uri' },
              example: ['https://cdn.example.com/products/sku-001/demo.mp4'],
            },
          },
        },
        BadRequest: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Bad Request' },
            message: { type: 'string', example: 'user_id is required and must be a non-empty string' },
          },
        },
        NotFound: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Not Found' },
            message: { type: 'string', example: 'Product not found' },
          },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
