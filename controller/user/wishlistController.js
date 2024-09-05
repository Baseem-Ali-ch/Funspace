//require model
const Wishlist = require("../../model/wishlistModel");
const Cart = require("../../model/cartModel");
const Product = require("../../model/productModel");
const Category = require("../../model/categoryModel");
const Offer = require("../../model/offerModel");
const mongoose = require("mongoose");




const loadWishlist = async (req, res) => {
    try {
      const user = req.session.user || req.user;
      const userId = user ? user._id : null;
  
      if (!userId) {
        return res.status(401).render("login", { message: "Please log in to view your wishlist" });
      }
  
      const wishlist = await Wishlist.findOne({ userId }).populate({
        path: "products.productId",
        populate: { path: "category", select: "title isListed" },
      });
      const categories = await Category.find({ isListed: "true" });
  
      let cartItems = [];
      if (userId) {
        const cart = await Cart.findOne({ userId }).populate("items.productId");
        cartItems = cart ? cart.items : [];
      }
  
      let filteredWishlistItems = [];
  
      if (wishlist && wishlist.products && wishlist.products.length > 0) {
        for (let item of wishlist.products) {
          const product = item.productId;
  
          // Skip unlisted products or products with unlisted categories
          if (!product || product.isListed !== "true" || !product.category || product.category.isListed !== "true") {
            continue;
          }
  
          // Reset final price and discount percentage
          let finalPrice = product.price;
          let discountPercentage = 0;
  
          // Fetch product-specific offer
          const productOffer = await Offer.findOne({
            offerType: "product",
            status: "active",
            productIds: product._id,
          });
  
          // Fetch category-specific offer
          let categoryOffer = null;
          if (product.category) {
            categoryOffer = await Offer.findOne({
              offerType: "category",
              status: "active",
              categoryIds: product.category._id,
            });
          }
  
          // Apply product-specific offer
          if (productOffer) {
            finalPrice = product.price - product.price * (productOffer.discount / 100);
            discountPercentage = Math.round(productOffer.discount);
          }
  
          // Apply category-specific offer if it has a higher discount
          if (categoryOffer && categoryOffer.discount > discountPercentage) {
            finalPrice = product.price - product.price * (categoryOffer.discount / 100);
            discountPercentage = Math.round(categoryOffer.discount);
          }
  
          // Attach final price and discount percentage to the product
          product.finalPrice = finalPrice;
          product.discountPercentage = discountPercentage;
  
          filteredWishlistItems.push(item);
        }
      }
  
      res.render("wishlist", {
        user,
        wishlistItems: filteredWishlistItems,
        categories,
        cartItems,
      });
    } catch (error) {
      console.error("Error loading wishlist:", error);
      res.status(500).send("Server Error");
    }
  };
  
  
  
  //add product to wishlist with productId and userId
  const addToWishlist = async (req, res) => {
    try {
      const userId = req.session.user ? req.session.user._id : null;
      const { productId } = req.body;
  
      if (!userId) {
        return res.status(401).json({ message: "Please login and continue", error: true });
      }
      if (!productId) {
        return res.status(400).json({ message: "Product ID is required", error: true });
      }
  
      const wishlist = await Wishlist.findOne({ userId });
      if (wishlist) {
        const existingProduct = wishlist.products.find((p) => p.productId.equals(productId));
        if (existingProduct) {
          return res.status(400).json({ message: "Item already in wishlist", error: true });
        }
        wishlist.products.push({ productId });
        await wishlist.save();
      } else {
        const newWishlist = new Wishlist({
          userId,
          products: [{ productId }],
        });
        await newWishlist.save();
      }
  
      res.status(200).json({ message: "Item added to wishlist", error: false });
    } catch (error) {
      console.error("Error adding item to wishlist:", error);
      res.status(500).json({ message: "Error adding item to wishlist", error: true });
    }
  };
  
  //remove products on the wishlist page
  const removeFromWishlist = async (req, res) => {
    try {
      const userId = req.session.user ? req.session.user._id : null;
      const { productId } = req.params;
  
      if (!userId) {
        console.log("User not logged in");
        return res.status(401).json({ message: "User not logged in", error: true });
      }
      if (!productId) {
        console.log("Product ID is required");
        return res.status(400).json({ message: "Product ID is required", error: true });
      }
  
      const wishlist = await Wishlist.findOne({ userId });
      if (wishlist) {
        const initialLength = wishlist.products.length;
        wishlist.products = wishlist.products.filter((product) => !product.productId.equals(productId));
        const finalLength = wishlist.products.length;
  
        if (initialLength === finalLength) {
          console.log("Product ID not found in wishlist");
          return res.status(404).json({ message: "Product not found in wishlist", error: true });
        }
  
        await wishlist.save();
      }
  
      console.log("Item removed from wishlist");
      res.status(200).json({ message: "Item removed from wishlist", error: false });
    } catch (error) {
      console.error("Error removing item from wishlist:", error);
      res.status(500).json({ message: "Error removing item from wishlist", error: true });
    }
  };

  module.exports = {
    loadWishlist,
    addToWishlist,
    removeFromWishlist
  };