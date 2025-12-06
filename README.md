# Two-User Chat System - Backend

A real-time chat application backend built with Node.js, Express, MongoDB, and Socket.io supporting text and media messages between two users.

## Features

- ✅ Real-time messaging with Socket.io
- ✅ JWT-based authentication
- ✅ Support for text, images, documents, and videos
- ✅ Read/Delivered receipts
- ✅ Typing indicators
- ✅ Online/Offline status
- ✅ Optimized APIs for large conversations
- ✅ Cloudinary integration for media storage
- ✅ Redis caching for performance
- ✅ Cursor-based pagination for chat history

## Tech Stack

- **Node.js** & **Express.js** - Backend framework
- **MongoDB** - Database with optimized indexing
- **Socket.io** - Real-time bidirectional communication
- **JWT** - Secure authentication
- **Cloudinary** - Media storage and optimization
- **Redis** - Caching layer (optional)
- **Multer** - File upload handling

## Installation

1. **Clone the repository**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

   Required environment variables:
   - `MONGODB_URI` - MongoDB connection string
   - `JWT_SECRET` - Secret key for JWT tokens
   - `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
   - `CLOUDINARY_API_KEY` - Cloudinary API key
   - `CLOUDINARY_API_SECRET` - Cloudinary API secret
   - `REDIS_URL` - Redis connection URL (optional)

4. **Run the server**
   
   Development mode:
   ```bash
   npm run dev
   ```

   Production mode:
   ```bash
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID

### Conversations
- `POST /api/conversations` - Create/get conversation
- `GET /api/conversations` - Get recent chats (paginated, cached)
- `GET /api/conversations/:id` - Get conversation by ID

### Messages
- `POST /api/messages` - Send text message
- `POST /api/messages/media` - Send media message
- `GET /api/messages/:conversationId` - Get chat history (cursor-based pagination)
- `PUT /api/messages/:messageId/read` - Mark message as read
- `PUT /api/messages/:conversationId/read-all` - Mark all as read

## Socket.io Events

### Client → Server
- `join_conversation` - Join a conversation room
- `leave_conversation` - Leave a conversation room
- `send_message` - Send a message in real-time
- `message_delivered` - Mark message as delivered
- `message_read` - Mark message as read
- `typing` - User is typing
- `stop_typing` - User stopped typing

### Server → Client
- `new_message` - Receive new message
- `message_sent` - Message sent confirmation
- `message_delivered` - Message delivery receipt
- `message_read` - Message read receipt
- `user_typing` - Another user is typing
- `user_stop_typing` - Another user stopped typing
- `user_online` - User came online
- `user_offline` - User went offline

## Optimization Techniques

### 1. Database Indexing
- Compound index on `Conversation.participants` for O(1) lookups
- Compound index on `Message.conversationId + createdAt` for fast queries
- Index on `Conversation.updatedAt` for sorting recent chats

### 2. Cursor-Based Pagination
- Chat history uses cursor-based pagination (timestamp)
- Avoids slow SKIP operations on large datasets
- Fetches 50 messages per page by default

### 3. Redis Caching
- Caches first page of recent chats for 5 minutes
- Invalidates cache when new message arrives
- Gracefully degrades if Redis is unavailable

### 4. Media Optimization
- Cloudinary auto-compression for images
- Automatic format selection (WebP)
- Video conversion to MP4
- CDN delivery for fast access

### 5. Query Optimization
- Uses `.lean()` for read-only queries (faster)
- Selective field population
- Minimal data transfer

### 6. Socket.io Optimization
- Message compression (> 1KB)
- Room-based event broadcasting
- JWT authentication at connection

### 7. Connection Pooling
- MongoDB connection pool (5-10 connections)
- Reuses connections across requests

## Project Structure

```
backend/
├── config/
│   └── database.js          # MongoDB configuration
├── middleware/
│   ├── auth.js             # JWT authentication
│   ├── upload.js           # Multer file upload
│   └── errorHandler.js     # Global error handler
├── models/
│   ├── User.js             # User model
│   ├── Conversation.js     # Conversation model
│   └── Message.js          # Message model
├── routes/
│   ├── auth.js             # Auth routes
│   ├── users.js            # User routes
│   ├── conversations.js    # Conversation routes
│   └── messages.js         # Message routes
├── socket/
│   └── index.js            # Socket.io handlers
├── utils/
│   ├── cloudinary.js       # Cloudinary utilities
│   └── redis.js            # Redis caching
├── .env.example            # Environment variables template
├── .gitignore
├── package.json
├── server.js               # Main server file
└── README.md
```

## Deployment

This backend can be deployed to:
- Render
- Railway
- Heroku
- Cyclic
- Vercel (with limitations)


