const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const wishlistSchema = mongoose.Schema({
  userId: { 
    type: Schema.Types.ObjectId,
    ref: "userRegister",
    required: true },

  products:[{
    productId: { 
        type: Schema.Types.ObjectId, 
        ref: "Product", 
        required: true
     },
  }]
});

module.exports = mongoose.model("wishlist", wishlistSchema);
