const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const { protect } = require('../middleware/auth');
const { getCache, setCache, deleteCache } = require('../utils/redis');

/**
 * @route   POST /api/conversations
 * @desc    Create or get existing conversation between two users
 * @access  Private
 */
router.post('/', protect, async (req, res, next) => {
    try {
        const { participantId } = req.body;

        if (!participantId) {
            return res.status(400).json({
                success: false,
                message: 'Please provide participant ID',
            });
        }

        // Check if conversation already exists
        const existingConversation = await Conversation.findOne({
            participants: { $all: [req.user.id, participantId] },
        }).populate('participants', 'username email avatar isOnline lastSeen')
            .populate('lastMessage');

        if (existingConversation) {
            return res.status(200).json({
                success: true,
                data: { conversation: existingConversation },
            });
        }

        // Create new conversation
        const conversation = await Conversation.create({
            participants: [req.user.id, participantId],
        });

        // Populate the conversation
        await conversation.populate('participants', 'username email avatar isOnline lastSeen');

        // Invalidate recent chats cache
        await deleteCache(`recent_chats:${req.user.id}`);
        await deleteCache(`recent_chats:${participantId}`);

        res.status(201).json({
            success: true,
            message: 'Conversation created successfully',
            data: { conversation },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/conversations
 * @desc    Get recent chats with pagination
 * @access  Private
 * OPTIMIZATION: Uses Redis caching for first page, sorted by updatedAt
 */
router.get('/', protect, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // OPTIMIZATION: Try to get from cache (first page only)
        if (page === 1) {
            const cachedData = await getCache(`recent_chats:${req.user.id}`);
            if (cachedData) {
                return res.status(200).json({
                    success: true,
                    cached: true,
                    ...cachedData,
                });
            }
        }

        // Find conversations where user is a participant
        // OPTIMIZATION: Sort by updatedAt (most recent first), use indexed field
        const conversations = await Conversation.find({
            participants: req.user.id,
        })
            .populate('participants', 'username email avatar isOnline lastSeen')
            .populate('lastMessage')
            .sort({ updatedAt: -1 }) // OPTIMIZATION: Index on updatedAt
            .limit(limit)
            .skip(skip)
            .lean(); // OPTIMIZATION: .lean() for faster queries

        const total = await Conversation.countDocuments({
            participants: req.user.id,
        });

        const response = {
            count: conversations.length,
            page,
            totalPages: Math.ceil(total / limit),
            total,
            data: { conversations },
        };

        // OPTIMIZATION: Cache first page for 5 minutes
        if (page === 1) {
            await setCache(`recent_chats:${req.user.id}`, response, 300);
        }

        res.status(200).json({
            success: true,
            cached: false,
            ...response,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/conversations/:id
 * @desc    Get conversation by ID
 * @access  Private
 */
router.get('/:id', protect, async (req, res, next) => {
    try {
        const conversation = await Conversation.findById(req.params.id)
            .populate('participants', 'username email avatar isOnline lastSeen')
            .populate('lastMessage');

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
            });
        }

        // Check if user is participant
        const isParticipant = conversation.participants.some(
            p => p._id.toString() === req.user.id
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this conversation',
            });
        }

        res.status(200).json({
            success: true,
            data: { conversation },
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
