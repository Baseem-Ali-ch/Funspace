const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    unique:true
  },
  slug: {
    type: String,
    required: true,
  },
  image: {
    type: String,
  },

  isListed: {
    type: String,
    required: true
  },
});



const Category = mongoose.model("Category", CategorySchema);

module.exports = Category;
