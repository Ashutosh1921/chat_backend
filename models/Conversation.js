const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
});

// OPTIMIZATION: Compound index for finding conversations between two users
conversationSchema.index({ participants: 1 });

// OPTIMIZATION: Index for sorting recent chats by last activity
conversationSchema.index({ updatedAt: -1 });

// Ensure exactly 2 participants
conversationSchema.pre('save', function () {
    if (this.participants.length !== 2) {
        throw new Error('A conversation must have exactly 2 participants');
    }
});

module.exports = mongoose.model('Conversation', conversationSchema);
