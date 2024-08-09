

const multer = require('multer');
const path = require('path');

// Set storage engine
const storage = multer.diskStorage({
    destination: './assets/images/add-product',
    filename: function(req, file, cb) {
        const timestamp = Date.now();
        const uniqueFilename = `${file.fieldname}-${timestamp}${path.extname(file.originalname)}`;
        cb(null, uniqueFilename);
    }
});


// Init upload
const uploadMulter = multer({
    storage: storage,
    limits: { fileSize: 1000000 }, // Limit file size to 1MB
    fileFilter: function(req, file, cb) {
        checkFileType(file, cb);
    }
}).fields([
    { name: 'productImage1', maxCount: 1 },
    { name: 'productImage2', maxCount: 1 },
    { name: 'productImage3', maxCount: 1 }
]);

// Check file type
function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Images Only!');
    }
}


// Initialize multer with storage configuration
const upload = multer({ storage: storage });

module.exports = upload;
