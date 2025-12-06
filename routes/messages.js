const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadImage, uploadVideo, uploadDocument } = require('../utils/cloudinary');
const { deleteCache } = require('../utils/redis');

// Socket.io instance will be injected
let io;

/**
 * @route   POST /api/messages
 * @desc    Send text message
 * @access  Private
 */
router.post('/', protect, async (req, res, next) => {
    try {
        const { conversationId, content } = req.body;

        if (!conversationId || !content) {
            return res.status(400).json({
                success: false,
                message: 'Please provide conversation ID and message content',
            });
        }

        // Verify conversation exists and user is participant
        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
            });
        }

        const isParticipant = conversation.participants.some(
            p => p.toString() === req.user.id
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to send message in this conversation',
            });
        }

        // Create message
        const message = await Message.create({
            conversation: conversationId,
            sender: req.user.id,
            messageType: 'text',
            content,
        });

        // Populate sender info
        await message.populate('sender', 'username avatar');

        // Invalidate recent chats cache for both participants
        for (const participantId of conversation.participants) {
            await deleteCache(`recent_chats:${participantId}`);
        }

        // REAL-TIME: Broadcast message via Socket.io
        if (io) {
            io.to(conversationId).emit('new_message', message);
        }

        res.status(201).json({
            success: true,
            message: 'Message sent successfully',
            data: { message },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/messages/media
 * @desc    Send media message (image/document/video)
 * @access  Private
 * OPTIMIZATION: Uploads to Cloudinary with compression
 */
router.post('/media', protect, upload.single('file'), async (req, res, next) => {
    try {
        const { conversationId } = req.body;

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                message: 'Please provide conversation ID',
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a file',
            });
        }

        // Verify conversation
        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
            });
        }

        const isParticipant = conversation.participants.some(
            p => p.toString() === req.user.id
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to send message in this conversation',
            });
        }

        // Determine message type and upload to Cloudinary
        let uploadResult;
        let messageType;

        if (req.file.mimetype.startsWith('image/')) {
            messageType = 'image';
            uploadResult = await uploadImage(req.file.buffer, req.file.originalname);
        } else if (req.file.mimetype.startsWith('video/')) {
            messageType = 'video';
            uploadResult = await uploadVideo(req.file.buffer, req.file.originalname);
        } else {
            messageType = 'document';
            uploadResult = await uploadDocument(req.file.buffer, req.file.originalname);
        }

        // Create message with file metadata
        const message = await Message.create({
            conversation: conversationId,
            sender: req.user.id,
            messageType,
            content: uploadResult.secure_url,
            fileMetadata: {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                cloudinaryPublicId: uploadResult.public_id,
            },
        });

        // Populate sender info
        await message.populate('sender', 'username avatar');

        // Invalidate recent chats cache
        for (const participantId of conversation.participants) {
            await deleteCache(`recent_chats:${participantId}`);
        }

        // REAL-TIME: Broadcast message via Socket.io
        if (io) {
            io.to(conversationId).emit('new_message', message);
        }

        res.status(201).json({
            success: true,
            message: 'Media sent successfully',
            data: { message },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/messages/:conversationId
 * @desc    Get chat history with cursor-based pagination
 * @access  Private
 * OPTIMIZATION: Uses cursor-based pagination for large conversations
 */
router.get('/:conversationId', protect, async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const cursor = req.query.cursor; // Timestamp or message ID

        // Verify conversation
        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
            });
        }

        const isParticipant = conversation.participants.some(
            p => p.toString() === req.user.id
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this conversation',
            });
        }

        // Build query
        const query = { conversation: conversationId };

        // OPTIMIZATION: Cursor-based pagination using createdAt timestamp
        // This avoids SKIP operations which are slow on large datasets
        if (cursor) {
            query.createdAt = { $lt: new Date(cursor) };
        }

        // OPTIMIZATION: Use compound index on (conversation, createdAt)
        // Fetch messages in reverse chronological order (latest first)
        const messages = await Message.find(query)
            .populate('sender', 'username avatar')
            .sort({ createdAt: -1 }) // Latest messages first
            .limit(limit + 1) // Fetch one extra to check if there are more
            .lean(); // OPTIMIZATION: .lean() for faster queries

        // Check if there are more messages
        const hasMore = messages.length > limit;
        if (hasMore) {
            messages.pop(); // Remove the extra message
        }

        // Get the cursor for next page (timestamp of last message)
        const nextCursor = messages.length > 0
            ? messages[messages.length - 1].createdAt.toISOString()
            : null;

        res.status(200).json({
            success: true,
            count: messages.length,
            hasMore,
            nextCursor,
            data: { messages },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PUT /api/messages/:messageId/read
 * @desc    Mark message as read
 * @access  Private
 */
router.put('/:messageId/read', protect, async (req, res, next) => {
    try {
        const { messageId } = req.params;

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found',
            });
        }

        // Only the receiver can mark a message as read (not the sender)
        if (message.sender.toString() === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Cannot mark your own message as read',
            });
        }

        // Update read status
        message.isRead = true;
        message.readAt = Date.now();
        await message.save();

        res.status(200).json({
            success: true,
            message: 'Message marked as read',
            data: { message },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PUT /api/messages/:conversationId/read-all
 * @desc    Mark all messages in a conversation as read
 * @access  Private
 */
router.put('/:conversationId/read-all', protect, async (req, res, next) => {
    try {
        const { conversationId } = req.params;

        // Verify conversation
        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
            });
        }

        // Mark all unread messages as read (except sender's own messages)
        const result = await Message.updateMany(
            {
                conversation: conversationId,
                sender: { $ne: req.user.id },
                isRead: false,
            },
            {
                $set: {
                    isRead: true,
                    readAt: Date.now(),
                },
            }
        );

        res.status(200).json({
            success: true,
            message: 'All messages marked as read',
            data: {
                modifiedCount: result.modifiedCount,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Function to set Socket.io instance
router.setSocketIO = (socketIO) => {
    io = socketIO;
};

module.exports = router;
