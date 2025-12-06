const multer = require('multer');
const path = require('path');

// Memory storage - files stored in memory for immediate processing
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
    // Allowed file types
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    const allowedDocTypes = /pdf|doc|docx|txt/;
    const allowedVideoTypes = /mp4|mov|avi|mkv/;

    const extname = path.extname(file.originalname).toLowerCase().slice(1);
    const mimetype = file.mimetype;

    // Check file type
    if (allowedImageTypes.test(extname) || mimetype.startsWith('image/')) {
        // Images - max 5MB
        return cb(null, true);
    } else if (allowedDocTypes.test(extname) || mimetype.startsWith('application/')) {
        // Documents - max 10MB
        return cb(null, true);
    } else if (allowedVideoTypes.test(extname) || mimetype.startsWith('video/')) {
        // Videos - max 50MB
        return cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images, documents, and videos are allowed.'));
    }
};

// Configure multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
    },
});

module.exports = upload;
