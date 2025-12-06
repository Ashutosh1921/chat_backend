const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');

/**
 * @route   GET /api/users
 * @desc    Get all users (for finding chat partners)
 * @access  Private
 */
router.get('/', protect, async (req, res, next) => {
    try {
        // Find all users except the current user
        const users = await User.find({ _id: { $ne: req.user.id } })
            .select('username email avatar isOnline lastSeen')
            .lean(); // OPTIMIZATION: .lean() returns plain JS objects, faster than Mongoose documents

        res.status(200).json({
            success: true,
            count: users.length,
            data: { users },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get('/:id', protect, async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id)
            .select('username email avatar isOnline lastSeen');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.status(200).json({
            success: true,
            data: { user },
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
