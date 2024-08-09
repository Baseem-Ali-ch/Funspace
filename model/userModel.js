const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  displayName: {
    type: String,
  },
  phone: {
    type: String,
  },
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  googleId: {
    type: String,
  },
  facebookId: {
    type: String,
  },
  is_admin: {
    type: Boolean,
    required: true,
    default: false,
  },
  is_verified: {
    type: Boolean,
    default: false,
  },
  isListed: {
    // Add this field
    type: String,
    default: true,
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
});

module.exports = mongoose.model("userRegister", userSchema);
