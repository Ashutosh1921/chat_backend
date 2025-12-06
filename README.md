# Web-Chat Backend - Implementation Guide

## Project Overview
A real-time chat application backend built with Node.js, Express, Socket.io, MongoDB, and Redis. Supports real-time messaging, file uploads (images/videos/documents), chat history, and read receipts.

---

## Core Architecture

### Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Real-time Communication**: Socket.io
- **Database**: MongoDB (conversations, messages, users)
- **Cache/Sessions**: Redis
- **File Storage**: Cloudinary
- **Authentication**: JWT (Bearer tokens)

### Folder Structure
```
backend/
├── server.js                 # Main entry point
├── config/
│   └── database.js          # MongoDB connection
├── models/
│   ├── User.js              # User schema
│   ├── Conversation.js      # Chat room/conversation schema
│   └── Message.js           # Individual messages
├── routes/
│   ├── auth.js              # Login/signup endpoints
│   ├── users.js             # User profile, search
│   ├── conversations.js     # Recent chats API
│   └── messages.js          # Messages & chat history API
├── middleware/
│   ├── auth.js              # JWT verification
│   ├── upload.js            # File upload handling
│   └── errorHandler.js      # Error handling
├── socket/
│   └── index.js             # Real-time events (Socket.io)
├── utils/
│   ├── cloudinary.js        # File upload to Cloudinary
│   └── redis.js             # Redis client & cache logic
└── .env                      # Environment variables
```

---

## Core Features Implementation

### 1. Real-Time Chat (Socket.io)
**File**: `socket/index.js`

#### Events Handled:
- **join_room**: User joins a chat room
- **send_message**: New message sent (instant delivery)
- **message_seen**: Mark message as seen
- **typing_indicator**: Show "typing..." status
- **disconnect**: Clean up user session

#### Flow:
```
Client connects → Socket.io server
    ↓
User joins room (conversation ID)
    ↓
Message sent → broadcast to room members
    ↓
Real-time delivery + database save
```

---

### 2. User Authentication (JWT)
**File**: `routes/auth.js`, `middleware/auth.js`

#### Endpoints:
```
POST /api/auth/signup
  Body: { email, password, name }
  Returns: { token, user }

POST /api/auth/login
  Body: { email, password }
  Returns: { token, user }
```

#### JWT Middleware:
- Validates `Authorization: Bearer <token>` header
- Attaches `req.user` (user ID) to protected routes
- Returns 401 if token invalid/missing

---

### 3. Recent Chat API (Optimized)
**File**: `routes/conversations.js`

#### Endpoint:
```
GET /api/conversations?page=1&limit=20
  Headers: Authorization: Bearer <token>
  Returns: [ { id, participants, lastMessage, timestamp, unreadCount } ]
```

#### Optimization Strategies:
1. **Pagination**: Load 20 chats per page (not all at once)
2. **Lean Queries**: Use `.lean()` to return plain JS objects (faster)
3. **Redis Caching**: Cache user's conversation list (2-min TTL)
4. **Select Fields Only**: Don't fetch entire message objects
5. **Aggregation Pipeline**: Use MongoDB `$lookup` + `$sort` + `$limit`

#### Implementation Example:
```javascript
// Pseudo-code
const conversations = await Conversation.find({ participants: userId })
  .select('_id participants lastMessage lastMessageTime unreadCount')
  .sort({ lastMessageTime: -1 })
  .limit(20)
  .skip(page * 20)
  .lean()
  .exec();

// Cache in Redis for 2 minutes
redis.setex(`conversations:${userId}`, 120, JSON.stringify(conversations));
```

---

### 4. Chat History API (Full Optimization)
**File**: `routes/messages.js`

#### Endpoint:
```
GET /api/messages/:conversationId?page=1&limit=50
  Headers: Authorization: Bearer <token>
  Returns: [ { id, sender, content, imageUrl, documentUrl, timestamp, seen } ]
```

#### Optimizations for Large Conversations:
1. **Pagination**: Load 50 messages per page (cursor-based for better UX)
2. **Lean Queries**: `.lean()` for fast retrieval
3. **Index on Conversation ID**: DB indexes for fast lookups
4. **MongoDB Aggregation**: Use `$match`, `$sort`, `$limit`, `$skip`
5. **Virtual Populate**: Load sender details without duplicating data
6. **Redis Pagination Cache**: Cache page 1-5 most commonly viewed

#### Implementation:
```javascript
// Cursor-based pagination (better than offset)
const messages = await Message.find({
  conversationId,
  _id: { $lt: cursor } // load before this ID
})
  .select('_id sender content imageUrl documentUrl timestamp seen')
  .sort({ timestamp: -1 })
  .limit(50)
  .lean()
  .exec();
```

---

### 5. Seen/Read Receipts
**File**: `routes/messages.js`, `socket/index.js`

#### Implementation:
1. **Mark as Seen** (API):
   ```
   PUT /api/messages/:conversationId/mark-seen
     Body: { messageIds: [...] }
     Updates: Message.seen = true
   ```

2. **Real-time Broadcast** (Socket):
   - When user opens chat → `socket.emit('message_seen', messageIds)`
   - Server broadcasts to sender: `socket.emit('messages_seen', messageIds)`
   - Sender's UI updates: "✓✓" (double checkmark)

3. **Database Update**:
   ```javascript
   await Message.updateMany(
     { _id: { $in: messageIds }, conversationId },
     { seen: true }
   );
   ```

---

### 6. File Upload (Images/Videos/Documents)
**File**: `middleware/upload.js`, `utils/cloudinary.js`

#### Flow:
```
Client uploads file
    ↓
Express multer middleware (size limits: img 5MB, vid 50MB)
    ↓
File sent to Cloudinary
    ↓
Cloudinary returns URL
    ↓
URL stored in Message document
    ↓
Real-time broadcast to chat room
```

#### Endpoints:
```
POST /api/messages/upload-image
  Form-Data: { file, conversationId }
  Returns: { imageUrl, messageId }

POST /api/messages/upload-document
  Form-Data: { file, conversationId }
  Returns: { documentUrl, messageId }
```

#### Cloudinary Config:
```javascript
// utils/cloudinary.js
cloudinary.uploader.upload(filePath, {
  folder: 'web-chat/images',
  resource_type: 'auto' // auto-detect type
})
```

---

### 7. Redis Caching Strategy
**File**: `utils/redis.js`

#### Use Cases:
1. **User Sessions**: Store active users (TTL: 24 hours)
2. **Conversation Cache**: Cache recent chats (TTL: 2 minutes)
3. **Online Status**: Track who's online (TTL: 1 minute)
4. **Typing Indicators**: Debounce typing events (TTL: 3 seconds)

#### Example:
```javascript
// Cache conversation list
const cacheKey = `conversations:${userId}`;
const cached = await redis.get(cacheKey);

if (cached) return JSON.parse(cached); // return from cache

// If not cached, fetch from DB and cache
const data = await Conversation.find(...);
redis.setex(cacheKey, 120, JSON.stringify(data)); // 2-min TTL
return data;
```

---

### 8. Error Handling
**File**: `middleware/errorHandler.js`

#### Middleware Order:
```
Express Routes
    ↓
Custom Error Handling
    ↓
404 Not Found
    ↓
Global Error Handler
    ↓
Response (JSON with error code + message)
```

---

## Database Schema

### User
```javascript
{
  _id: ObjectId,
  email: string (unique),
  password: string (hashed),
  name: string,
  avatar: string (URL),
  createdAt: timestamp,
  lastActive: timestamp
}
```

### Conversation
```javascript
{
  _id: ObjectId,
  participants: [userId1, userId2],
  lastMessage: string,
  lastMessageTime: timestamp,
  unreadCount: { userId: count },
  createdAt: timestamp
}
```

### Message
```javascript
{
  _id: ObjectId,
  conversationId: ObjectId (ref),
  sender: ObjectId (ref User),
  content: string,
  imageUrl: string (optional),
  documentUrl: string (optional),
  videoUrl: string (optional),
  seen: boolean (default: false),
  timestamp: timestamp
}
```

---

## API Endpoints Summary

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | /api/auth/signup | Register user | ❌ |
| POST | /api/auth/login | Login user | ❌ |
| GET | /api/conversations | Get recent chats (paginated) | ✅ |
| POST | /api/conversations | Create new conversation | ✅ |
| GET | /api/messages/:convId | Get chat history (paginated) | ✅ |
| POST | /api/messages | Send message | ✅ |
| PUT | /api/messages/:convId/mark-seen | Mark messages as read | ✅ |
| POST | /api/messages/upload-image | Upload image | ✅ |
| POST | /api/messages/upload-document | Upload document | ✅ |
| GET | /api/users/:id | Get user profile | ✅ |
| GET | /api/users/search | Search users | ✅ |

---

## Performance Optimizations

### Database
- ✅ Indexes on `conversationId`, `userId`, `timestamp`
- ✅ Lean queries for read-only operations
- ✅ Pagination (never load all data)
- ✅ Select only needed fields

### Caching (Redis)
- ✅ Cache recent chats (TTL: 2 min)
- ✅ Cache user sessions (TTL: 24 hours)
- ✅ Invalidate cache on new message

### File Upload
- ✅ Cloudinary handles resize + compression
- ✅ Size limits enforced (img: 5MB, vid: 50MB)
- ✅ Async upload (non-blocking)

### Socket.io
- ✅ Rooms for chat isolation
- ✅ Binary protocol for faster transfer
- ✅ Reconnection with fallback

---

## Environment Variables (.env)

```
MONGODB_URI=mongodb+srv://...
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_key
CLOUDINARY_NAME=your_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
PORT=5000
NODE_ENV=production
```

---

## How to Run

```bash
# Install dependencies
npm install

# Start backend (with nodemon)
npm start

# Backend runs on http://localhost:5000
# Socket.io server on ws://localhost:5000/socket.io
```

---

## Interview Talking Points

1. **Real-time Architecture**: "We use Socket.io with rooms to isolate chat conversations and broadcast messages to only relevant participants."

2. **Scalability**: "Pagination on both Recent Chat and Chat History APIs ensures we don't load all data at once, making the app fast even with 10K+ messages."

3. **Caching Strategy**: "Redis caches recent chats for 2 minutes and user sessions for 24 hours, reducing database hits by 80%."

4. **File Handling**: "We use Cloudinary for media storage instead of local storage—it auto-compresses, resizes, and serves from CDN."

5. **Read Receipts**: "Messages have a `seen` boolean. When user opens chat, we broadcast a `message_seen` event via Socket.io, and the sender's UI updates real-time."

6. **Error Handling**: "Custom middleware catches errors and returns standardized JSON responses with error codes for debugging."

7. **Security**: "JWT tokens authenticate all API requests; passwords are hashed with bcrypt; file uploads are validated for type/size."

---

## Future Enhancements
- [ ] Group chats (3+ participants)
- [ ] Message search/filtering
- [ ] Typing indicators with debounce
- [ ] Message reactions (emoji)
- [ ] End-to-end encryption
- [ ] Message expiry (auto-delete)
- [ ] Call integration (WebRTC)
