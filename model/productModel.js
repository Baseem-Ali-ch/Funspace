

const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: { 
    type: String, required: true },
  price: { type: Number, required: true },
  discountedPrice: { type: Number },
  category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
  stock: { type: Number, required: true },
  imageUrl_1: { type: String },
  imageUrl_2: { type: String },
  imageUrl_3: { type: String },
  isListed: {
    type: String,
    required: true,
  },
});

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
