const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    messageType: {
        type: String,
        enum: ['text', 'image', 'document', 'video'],
        default: 'text',
    },
    content: {
        type: String,
        required: true,
    },
    fileMetadata: {
        fileName: String,
        fileSize: Number,
        mimeType: String,
        cloudinaryPublicId: String,
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    readAt: {
        type: Date,
    },
    isDelivered: {
        type: Boolean,
        default: false,
    },
    deliveredAt: {
        type: Date,
    },
}, {
    timestamps: true,
});

// OPTIMIZATION: Compound index for efficient chat history queries
// This allows fast retrieval of messages for a specific conversation sorted by time
messageSchema.index({ conversation: 1, createdAt: -1 });

// OPTIMIZATION: Index on conversation for filtering
messageSchema.index({ conversation: 1 });

// OPTIMIZATION: Index on createdAt for chronological ordering
messageSchema.index({ createdAt: -1 });

// Update conversation's lastMessage and updatedAt when a new message is created
messageSchema.post('save', async function () {
    const Conversation = mongoose.model('Conversation');
    await Conversation.findByIdAndUpdate(this.conversation, {
        lastMessage: this._id,
        updatedAt: Date.now(),
    });
});

module.exports = mongoose.model('Message', messageSchema);
