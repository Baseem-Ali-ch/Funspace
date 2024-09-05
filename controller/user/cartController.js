//require model
const Wishlist = require("../../model/wishlistModel");
const Cart = require("../../model/cartModel");
const Product = require("../../model/productModel");
const Category = require("../../model/categoryModel");
const Offer = require("../../model/offerModel");
const mongoose = require("mongoose");


//load cart page who have an account
const loadCart = async (req, res) => {
    try {
      const user = req.session.user || req.user;
      const userId = user ? user._id : null;
  
      if (!userId) {
        return res.status(401).render("login", { message: "Please log in to view your cart" });
      }
  
      const wishlistItems = await Wishlist.findOne({ userId }).populate("products.productId");
      const cart = await Cart.findOne({ userId }).populate("items.productId");
  
      if (!cart || !cart.items) {
        return res.render("cart", { user, cartItems: [], wishlistItems: wishlistItems ? wishlistItems.products : [] });
      }
  
      const validCartItems = cart.items.filter((item) => item.productId != null);
  
      // Calculate the offer price for each product in the cart
      for (let item of validCartItems) {
        // Find active product-specific offers
        const productOffer = await Offer.findOne({
          offerType: "product",
          status: "active",
          productIds: item.productId._id, // Note the use of productIds instead of productId
        }).exec();
  
        // Find active category-specific offers
        const categoryOffer = await Offer.findOne({
          offerType: "category",
          status: "active",
          categoryIds: item.productId.category, // Note the use of categoryIds instead of categoryId
        }).exec();
  
        // Apply the highest offer available (either product or category)
        let bestOffer = null;
        if (productOffer && categoryOffer) {
          bestOffer = productOffer.discount > categoryOffer.discount ? productOffer : categoryOffer;
        } else {
          bestOffer = productOffer || categoryOffer;
        }
  
        // Attach the best offer to the product and calculate discounted price
        if (bestOffer) {
          item.productId.offer = bestOffer;
          item.productId.discountedPrice = (item.productId.price * (1 - bestOffer.discount / 100)).toFixed(2);
        } else {
          item.productId.discountedPrice = item.productId.price;
        }
      }
  
      // Calculate totals for price details in the summary section
      let totalPrice = 0;
      let totalDiscountedPrice = 0;
      let deliveryCharge = 0; // Update this based on your delivery charge logic
  
      validCartItems.forEach(item => {
        const price = item.productId.price;
        const discountedPrice = item.productId.discountedPrice;
  
        if (discountedPrice && price > discountedPrice) {
          totalPrice += price * item.quantity;
          totalDiscountedPrice += discountedPrice * item.quantity;
        } else {
          totalPrice += price * item.quantity;
          totalDiscountedPrice += price * item.quantity;
        }
      });
  
      let discount = totalPrice - totalDiscountedPrice;
      let grandTotal = totalDiscountedPrice + deliveryCharge;
  
      res.render("cart", {
        user,
        cartItems: validCartItems,
        wishlistItems: wishlistItems ? wishlistItems.products : [],
        totalPrice: totalPrice.toFixed(2),
        discount: discount.toFixed(2),
        deliveryCharge: deliveryCharge.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
      });
    } catch (error) {
      console.error("Error loading cart:", error);
      res.status(500).send("Server Error");
    }
  };
  
  
  //add a product to cart
  const addToCart = async (req, res) => {
    try {
      const userId = req.session.user ? req.session.user._id : null;
      let { productId, quantity } = req.body;
  
      if (!userId) {
        return res.status(401).json({ message: "Please login and continue", success: false });
      }
      if (!productId || !quantity) {
        return res.status(400).json({ message: "Product ID and quantity are required", success: false });
      }
  
      // Ensure productId is a valid ObjectId string
      if (typeof productId === "object" && productId.productId) {
        productId = productId.productId;
      }
  
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ message: "Invalid product ID", success: false });
      }
  
      // Convert productId to ObjectId
      const productObjectId = new mongoose.Types.ObjectId(productId);
  
      // Check the product stock
      const product = await Product.findById(productObjectId);
      if (!product) {
        return res.status(404).json({ message: "Product not found", success: false });
      }
  
      // Ensure the quantity does not exceed available stock and the limit of 5
      if (quantity > 5) {
        return res.status(400).json({ message: "You can only add up to 5 items of this product", success: false });
      }
  
      if (product.stock < quantity) {
        return res.status(400).json({ message: "Not enough stock available", success: false });
      }
  
      // // Update the product quantity
      // product.stock -= quantity;
      // await product.save();
  
      const cart = await Cart.findOne({ userId });
      if (cart) {
        const itemIndex = cart.items.findIndex((item) => item.productId.equals(productObjectId));
        if (itemIndex > -1) {
          const existingQuantity = cart.items[itemIndex].quantity;
          const newQuantity = existingQuantity + quantity;
  
          if (newQuantity > 5) {
            return res.status(400).json({ message: "Cannot add more than 5 items of this product to the cart", success: false });
          }
  
          cart.items[itemIndex].quantity = newQuantity;
        } else {
          cart.items.push({ productId: productObjectId, quantity });
        }
        await cart.save();
      } else {
        const newCart = new Cart({
          userId,
          items: [{ productId: productObjectId, quantity }],
        });
        await newCart.save();
      }
  
      res.status(200).json({ message: "Item added to cart", success: true });
    } catch (error) {
      console.error("Error adding item to cart:", error);
      res.status(500).json({ message: "Error adding item to cart", success: false });
    }
  };
  
  //update the cart item quantity
  const updateCartItemQty = async (req, res) => {
    try {
      const userId = req.session.user ? req.session.user._id : null;
      const { productId } = req.params;
      const { quantity } = req.body;
  
      if (!userId) {
        return res.status(401).json({ message: "Please login to continue", success: false });
      }
  
      if (!productId || quantity === undefined) {
        return res.status(400).json({ message: "Product ID and quantity are required", success: false });
      }
  
      // Limit the maximum quantity that can be added to the cart
      if (quantity > 5) {
        return res.status(400).json({ message: "Cannot add more than 5 units of a product to the cart", success: false });
      }
  
      const productObjectId = new mongoose.Types.ObjectId(productId);
  
      const cart = await Cart.findOne({ userId }).populate("items.productId");
      if (!cart) {
        return res.status(404).json({ message: "Cart not found", success: false });
      }
  
      const cartItem = cart.items.find((item) => item.productId._id.equals(productObjectId));
      if (!cartItem) {
        return res.status(404).json({ message: "Product not found in cart", success: false });
      }
  
      const product = cartItem.productId;
  
      if (quantity > product.stock) {
        return res.status(400).json({ message: "Requested quantity exceeds available stock", success: false });
      }
  
      // Calculate total stock
      const totalStock = product.stock + cartItem.quantity;
      if (quantity > totalStock) {
        return res.status(400).json({ message: "Requested quantity exceeds available stock", success: false });
      }
  
      // Update the cart item quantity
      cartItem.quantity = quantity;
  
      // Remove the item from the cart if quantity is set to zero
      if (quantity === 0) {
        cart.items = cart.items.filter((item) => !item.productId.equals(productObjectId));
      }
  
      await cart.save();
      const itemTotalPrice = product.discountedPrice ? product.discountedPrice * quantity : product.price * quantity;
  
      const newTotalPrice = cart.items.reduce((total, item) => {
        const price = item.productId.discountedPrice || item.productId.price;
        return total + price * item.quantity;
      }, 0);
  
      res.status(200).json({
        message: "Cart updated successfully",
        success: true,
        cartItems: cart.items,
        stock: product.stock,
        itemTotalPrice,
        newTotalPrice,
      });
    } catch (error) {
      console.error("Error updating cart item quantity:", error);
      res.status(500).json({ message: "Error updating cart item quantity", success: false });
    }
  };
  
  //remove products from cart
  const removeFromCart = async (req, res) => {
    try {
      const userId = req.session.user ? req.session.user._id : null;
      const { productId } = req.params;
  
      if (!userId) {
        return res.status(401).json({ message: "Please login to continue", success: false });
      }
  
      if (!productId) {
        return res.status(400).json({ message: "Product ID is required", success: false });
      }
  
      // Ensure productId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ message: "Invalid product ID", success: false });
      }
  
      const productObjectId = new mongoose.Types.ObjectId(productId);
  
      // Find the user's cart
      const cart = await Cart.findOne({ userId });
  
      if (!cart) {
        return res.status(404).json({ message: "Cart not found", success: false });
      }
  
      // Find the item in the cart
      const cartItemIndex = cart.items.findIndex((item) => item.productId.equals(productObjectId));
  
      if (cartItemIndex === -1) {
        return res.status(404).json({ message: "Product not found in cart", success: false });
      }
  
      // Get the quantity of the item being removed
      const removedQuantity = cart.items[cartItemIndex].quantity;
  
      // Remove the item from the cart
      cart.items.splice(cartItemIndex, 1);
      await cart.save();
  
      // Update the product stock
      // const product = await Product.findById(productObjectId);
      // if (product) {
      //   product.stock += removedQuantity;
      //   await product.save();
      // }
  
      res.status(200).json({ message: "Item removed from cart", success: true, redirecturl: "/cart" });
    } catch (error) {
      console.error("Error removing Item from cart:", error);
      res.status(500).json({ message: "Error removing Item from cart", success: false });
    }
  };
  


  module.exports = {
    loadCart,
    addToCart,
    updateCartItemQty,
    removeFromCart
  };