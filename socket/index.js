const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { deleteCache } = require('../utils/redis');

module.exports = (io) => {
    // Socket.io authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;

            if (!token) {
                return next(new Error('Authentication error'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id);

            if (!user) {
                return next(new Error('User not found'));
            }

            socket.user = user;
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', async (socket) => {
        console.log(`User connected: ${socket.user.username} (${socket.user._id})`);

        // Update user online status
        await User.findByIdAndUpdate(socket.user._id, {
            isOnline: true,
            lastSeen: Date.now(),
        });

        // Join user to their own room
        socket.join(socket.user._id.toString());

        // Broadcast online status to all users
        socket.broadcast.emit('user_online', {
            userId: socket.user._id,
            username: socket.user.username,
        });

        /**
         * Join a conversation room
         */
        socket.on('join_conversation', async (conversationId) => {
            try {
                // Verify user is participant
                const conversation = await Conversation.findById(conversationId);

                if (!conversation) {
                    socket.emit('error', { message: 'Conversation not found' });
                    return;
                }

                const isParticipant = conversation.participants.some(
                    p => p.toString() === socket.user._id.toString()
                );

                if (!isParticipant) {
                    socket.emit('error', { message: 'Not authorized' });
                    return;
                }

                socket.join(conversationId);
                console.log(`User ${socket.user.username} joined conversation ${conversationId}`);

                socket.emit('joined_conversation', { conversationId });
            } catch (error) {
                console.error('Error joining conversation:', error);
                socket.emit('error', { message: 'Failed to join conversation' });
            }
        });

        /**
         * Leave a conversation room
         */
        socket.on('leave_conversation', (conversationId) => {
            socket.leave(conversationId);
            console.log(`User ${socket.user.username} left conversation ${conversationId}`);
        });

        /**
         * Send message (real-time)
         */
        socket.on('send_message', async (data) => {
            try {
                const { conversationId, content, messageType = 'text' } = data;

                // Verify conversation
                const conversation = await Conversation.findById(conversationId);

                if (!conversation) {
                    socket.emit('error', { message: 'Conversation not found' });
                    return;
                }

                const isParticipant = conversation.participants.some(
                    p => p.toString() === socket.user._id.toString()
                );

                if (!isParticipant) {
                    socket.emit('error', { message: 'Not authorized' });
                    return;
                }

                // Create message
                const message = await Message.create({
                    conversation: conversationId,
                    sender: socket.user._id,
                    messageType,
                    content,
                });

                await message.populate('sender', 'username avatar');

                // OPTIMIZATION: Invalidate cache for both participants
                for (const participantId of conversation.participants) {
                    await deleteCache(`recent_chats:${participantId}`);
                }

                // Emit to all users in the conversation room
                io.to(conversationId).emit('new_message', message);

                // Send delivery confirmation to sender
                socket.emit('message_sent', {
                    messageId: message._id,
                    tempId: data.tempId, // Client-side temporary ID
                });

            } catch (error) {
                console.error('Error sending message:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        /**
         * Mark message as delivered
         */
        socket.on('message_delivered', async (data) => {
            try {
                const { messageId } = data;

                const message = await Message.findByIdAndUpdate(
                    messageId,
                    {
                        isDelivered: true,
                        deliveredAt: Date.now(),
                    },
                    { new: true }
                );

                if (message) {
                    // Notify the sender
                    io.to(message.sender.toString()).emit('message_delivered', {
                        messageId: message._id,
                        deliveredAt: message.deliveredAt,
                    });
                }
            } catch (error) {
                console.error('Error marking message as delivered:', error);
            }
        });

        /**
         * Mark message as read
         */
        socket.on('message_read', async (data) => {
            try {
                const { messageId } = data;

                const message = await Message.findByIdAndUpdate(
                    messageId,
                    {
                        isRead: true,
                        readAt: Date.now(),
                    },
                    { new: true }
                );

                if (message) {
                    // Notify the sender about read receipt
                    io.to(message.sender.toString()).emit('message_read', {
                        messageId: message._id,
                        readAt: message.readAt,
                    });
                }
            } catch (error) {
                console.error('Error marking message as read:', error);
            }
        });

        /**
         * Typing indicator
         */
        socket.on('typing', (data) => {
            const { conversationId } = data;
            // Broadcast to others in the conversation (exclude sender)
            socket.to(conversationId).emit('user_typing', {
                userId: socket.user._id,
                username: socket.user.username,
                conversationId,
            });
        });

        /**
         * Stop typing indicator
         */
        socket.on('stop_typing', (data) => {
            const { conversationId } = data;
            socket.to(conversationId).emit('user_stop_typing', {
                userId: socket.user._id,
                conversationId,
            });
        });

        /**
         * User disconnect
         */
        socket.on('disconnect', async () => {
            console.log(`User disconnected: ${socket.user.username}`);

            // Update user offline status
            await User.findByIdAndUpdate(socket.user._id, {
                isOnline: false,
                lastSeen: Date.now(),
            });

            // Broadcast offline status
            socket.broadcast.emit('user_offline', {
                userId: socket.user._id,
                username: socket.user.username,
                lastSeen: Date.now(),
            });
        });
    });
};
