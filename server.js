require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/database');
const { initRedis } = require('./utils/redis');
const errorHandler = require('./middleware/errorHandler');
const socketHandler = require('./socket');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins including file://
        methods: ['GET', 'POST'],
        credentials: false, // Must be false when origin is '*'
    },
    // OPTIMIZATION: Enable compression for Socket.io messages
    perMessageDeflate: {
        threshold: 1024, // Only compress messages larger than 1KB
    },
    // Allow polling and websocket transports
    transports: ['polling', 'websocket'],
    allowEIO3: true,
});

// Connect to MongoDB
connectDB();

// Initialize Redis (optional - gracefully handles if unavailable)
initRedis();

// Middleware
app.use(cors({
    origin: true, // Allow all origins including file://
    credentials: false, // Consistent with Socket.io
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Health check route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Chat API is running',
        version: '1.0.0',
    });
});

app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
    });
});

// Initialize Socket.io handlers
socketHandler(io);

// Inject Socket.io into routes that need it
messageRoutes.setSocketIO(io);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
});

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log('=================================');
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('=================================');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.log('UNHANDLED REJECTION! Shutting down...');
    console.error(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});

// Handle SIGTERM
process.on('SIGTERM', () => {
    console.log('SIGTERM RECEIVED. Shutting down gracefully...');
    server.close(() => {
        console.log('Process terminated!');
    });
});
