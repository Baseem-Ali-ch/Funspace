//require model
const Wishlist = require("../../model/wishlistModel");
const Cart = require("../../model/cartModel");
const Product = require("../../model/productModel");
const Category = require("../../model/categoryModel");

const mongoose = require("mongoose");

//load product detailed page for user
const loadProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;

    const product = await Product.findById(productId).populate("category", "title");
    const categories = await Category.find({ isListed: "true" });
    const relatedProduct = await Product.find({ category: product.category, _id: { $ne: productId } }).limit(4);

    let wishlistItems = [];
    if (userId) {
      const wishlist = await Wishlist.findOne({ userId }).populate("products.productId");
      wishlistItems = wishlist ? wishlist.products : [];
    }

    let cartItems = [];
    if (userId) {
      const cart = await Cart.findOne({ userId }).populate("items.productId");
      cartItems = cart ? cart.items : [];
    }

    if (!product) {
      return res.status(404).send("Product not found");
    }

    const breadcrumbs = [
      { name: "Home", url: "/" },
      { name: "Product List", url: "/product-list" },
      { name: product.name, url: `/product/${product._id}` },
    ];

    res.render("product", {
      product,
      user,
      wishlistItems,
      cartItems,
      breadcrumbs,
      categories,
      relatedProduct,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

//load product list page, contain all product
const loadProductList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const listedCategories = await Category.find({ isListed: "true" }).select("_id");
    const categories = await Category.find({ isListed: "true" });
    const products = await Product.find({ isListed: "true" })
      .populate({ path: "category", match: { isListed: "true" }, select: "title" })
      .skip(skip)
      .limit(limit);

    const totalProducts = await Product.countDocuments({
      isListed: "true",
      category: { $in: listedCategories.map((cat) => cat._id) },
    });
    const totalPages = Math.ceil(totalProducts / limit);
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;

    let wishlistItems = [];
    if (userId) {
      const wishlist = await Wishlist.findOne({ userId }).populate("products.productId");
      wishlistItems = wishlist ? wishlist.products : [];
    }

    let cartItems = [];
    if (userId) {
      const cart = await Cart.findOne({ userId }).populate("items.productId");
      cartItems = cart ? cart.items : [];
    }

    res.render("product-list", {
      products,
      categories: listedCategories,
      user,
      currentPage: page,
      totalPages,
      wishlistItems,
      cartItems,
      categories,
    });
  } catch (error) {
    console.log(error);
  }
};

const filterAndSortProducts = async (req, res) => {
  try {
    const { categories, sort } = req.body;
    let query = {};
    let sortOption = { createdAt: -1 }; // Default sort

    if (categories && categories.length > 0) {
      query.category = { $in: categories };
    }

    switch (sort) {
      case "name_asc":
        sortOption = { name: 1 };
        break;
      case "name_desc":
        sortOption = { name: -1 };
        break;
      case "price_asc":
        sortOption = { price: 1 };
        break;
      case "price_desc":
        sortOption = { price: -1 };
        break;
      case "newest":
        sortOption = { createdAt: -1 };
        break;
      case "oldest":
        sortOption = { createdAt: 1 };
        break;
    }

    const products = await Product.find(query).sort(sortOption).populate("category");

    res.json({ products });
  } catch (error) {
    console.error("Error fetching filtered and sorted products:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

//load wishlist page who have account
const loadWishlist = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    console.log("User from session:", user);
    const userId = user ? user._id : null;

    if (!userId) {
      return res.status(401).render("login", { message: "Please log in to view your wishlist" });
    }

    const wishlistItems = await Wishlist.findOne({ userId }).populate("products.productId");
    const categories = await Category.find({ isListed: "true" });

    let cartItems = [];
    if (userId) {
      const cart = await Cart.findOne({ userId }).populate("items.productId");
      cartItems = cart ? cart.items : [];
    }

    res.render("wishlist", {
      user,
      wishlistItems: wishlistItems ? wishlistItems.products : [], // Handle null wishlistItems
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

    res.render("cart", {
      user,
      cartItems: validCartItems,
      wishlistItems: wishlistItems ? wishlistItems.products : [],
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

    if (product.stock < quantity) {
      return res.status(400).json({ message: "Not enough stock available", success: false });
    }

    // Update the product quantity
    product.stock -= quantity;
    await product.save();

    const cart = await Cart.findOne({ userId });
    if (cart) {
      const itemIndex = cart.items.findIndex((item) => item.productId.equals(productObjectId));
      if (itemIndex > -1) {
        cart.items[itemIndex].quantity += quantity;
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

    const productObjectId = new mongoose.Types.ObjectId(productId);

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found", success: false });
    }

    const cartItem = cart.items.find((item) => item.productId.equals(productObjectId));
    if (!cartItem) {
      return res.status(404).json({ message: "Product not found in cart", success: false });
    }

    const product = await Product.findById(productObjectId);
    if (!product) {
      return res.status(404).json({ message: "Product not found", success: false });
    }

    const totalStock = product.stock + cartItem.quantity;
    if (quantity > totalStock) {
      return res.status(400).json({ message: "Requested quantity exceeds available stock", success: false });
    }

    const quantityDifference = quantity - cartItem.quantity;
    product.stock -= quantityDifference;
    await product.save();

    cartItem.quantity = quantity;

    if (quantity === 0) {
      cart.items = cart.items.filter((item) => !item.productId.equals(productObjectId));
    }

    await cart.save();
    res.status(200).json({
      message: "Cart updated successfully",
      success: true,
      totalStock: product.stock + quantity,
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
    const product = await Product.findById(productObjectId);
    if (product) {
      product.stock += removedQuantity;
      await product.save();
    }

    res.status(200).json({ message: "Item removed from cart", success: true, redirecturl: "/cart" });
  } catch (error) {
    console.error("Error removing Item from cart:", error);
    res.status(500).json({ message: "Error removing Item from cart", success: false });
  }
};

module.exports = {
  loadProduct,
  loadProductList,
  filterAndSortProducts,
  loadWishlist,
  addToWishlist,
  removeFromWishlist,
  loadCart,
  addToCart,
  updateCartItemQty,
  removeFromCart,
};
