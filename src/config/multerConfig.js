const multer = require("multer");
const cloudinary = require('cloudinary').v2;

// Set up multer memory storage
const storage = multer.memoryStorage(); // Store files in memory as buffer

const fileFilter = (req, file, cb) => {
  // Accept image files only
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

// Initialize multer with memory storage and file filter
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Max file size: 5 MB
});

module.exports = upload;
