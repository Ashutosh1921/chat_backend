const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            // Connection pooling - optimizes database connections
            maxPoolSize: 10,
            minPoolSize: 5,
            socketTimeoutMS: 45000,
        });

        console.log(`MongoDB Connected: ${conn.connection.host}`);

        // Enable debugging in development
        if (process.env.NODE_ENV === 'development') {
            mongoose.set('debug', true);
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
