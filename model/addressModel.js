const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
  },
  streetAddress: {
    type: String,
    required: true,
  },
  apartment: {
    type: String,
  },
  town: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  postcode: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "userModel" },
});

module.exports = mongoose.model("Address", addressSchema);
