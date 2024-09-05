const multer = require('multer');
const path = require('path');

// Set up storage engine
const storage = multer.diskStorage({
    destination: './assets/images/add-product', // Destination folder for uploaded images
    filename: function(req, file, cb) {
        const timestamp = Date.now();
        const uniqueFilename = `${file.fieldname}-${timestamp}${path.extname(file.originalname)}`;
        cb(null, uniqueFilename); // Unique filename with timestamp
    }
});

// File type validation function
function checkFileType(file, cb) {
    const allowedFileTypes = /jpeg|jpg|png/; // Allowed file types
    const extname = allowedFileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedFileTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true); // Accept file
    } else {
        cb(new Error('Please upload a valid image file (jpg, jpeg, png)')); // Reject file with error
    }
}

// Configure multer with storage engine and file validation
const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB file size limit
    fileFilter: function(req, file, cb) {
        checkFileType(file, cb); // Check file type
    }
}).fields([
    { name: 'productImage1', maxCount: 1 },
    { name: 'productImage2', maxCount: 1 },
    { name: 'productImage3', maxCount: 1 }
]);

module.exports = upload;
