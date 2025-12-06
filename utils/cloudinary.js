const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload image to Cloudinary with optimization
 * OPTIMIZATION: Auto-compress and convert to WebP for smaller file sizes
 */
const uploadImage = async (fileBuffer, fileName) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'chat-images',
                resource_type: 'image',
                public_id: `${Date.now()}-${fileName}`,
                transformation: [
                    { quality: 'auto:good' }, // Auto-optimize quality
                    { fetch_format: 'auto' }, // Auto-select best format (WebP)
                ],
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );

        uploadStream.end(fileBuffer);
    });
};

/**
 * Upload video to Cloudinary
 * OPTIMIZATION: Generate thumbnail and optimize video
 */
const uploadVideo = async (fileBuffer, fileName) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'chat-videos',
                resource_type: 'video',
                public_id: `${Date.now()}-${fileName}`,
                eager: [
                    { format: 'mp4', quality: 'auto' } // Convert to MP4 with auto quality
                ],
                eager_async: true,
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );

        uploadStream.end(fileBuffer);
    });
};

/**
 * Upload document to Cloudinary
 */
const uploadDocument = async (fileBuffer, fileName) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'chat-documents',
                resource_type: 'raw',
                public_id: `${Date.now()}-${fileName}`,
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );

        uploadStream.end(fileBuffer);
    });
};

/**
 * Delete file from Cloudinary
 */
const deleteFile = async (publicId, resourceType = 'image') => {
    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
        console.error('Error deleting file from Cloudinary:', error);
    }
};

module.exports = {
    uploadImage,
    uploadVideo,
    uploadDocument,
    deleteFile,
};
