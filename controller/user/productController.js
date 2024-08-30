//require model
const Wishlist = require("../../model/wishlistModel");
const Cart = require("../../model/cartModel");
const Product = require("../../model/productModel");
const Category = require("../../model/categoryModel");
const Offer = require("../../model/offerModel");
const mongoose = require("mongoose");

//load product detailed page for user
const loadProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;

    const product = await Product.findById(productId).populate("category", "title");
    const categories = await Category.find({ isListed: "true" });
    let relatedProduct = await Product.find({ category: product.category, _id: { $ne: productId } }).limit(4);

    // Fetch product-specific offer
    const productOffer = await Offer.findOne({
      offerType: "product",
      status: "active",
      productIds: product._id,
    }).exec();

    // Fetch category-specific offer
    let categoryOffer = null;
    if (product.category) {
      categoryOffer = await Offer.findOne({
        offerType: "category",
        status: "active",
        categoryIds: product.category._id,
      }).exec();
    }

    // Calculate final price and discount percentage for the main product
    let finalPrice = product.price;
    let discountPercentage = 0;

    if (productOffer) {
      finalPrice = product.price - product.price * (productOffer.discount / 100);
      discountPercentage = Math.round(productOffer.discount);
    }

    if (categoryOffer && categoryOffer.discount > discountPercentage) {
      finalPrice = product.price - product.price * (categoryOffer.discount / 100);
      discountPercentage = Math.round(categoryOffer.discount);
    }

    // Attach the offer details to the main product
    product.finalPrice = finalPrice;
    product.discountPercentage = discountPercentage;

    // Calculate final price and discount for each related product
    relatedProduct = await Promise.all(
      relatedProduct.map(async (relatedProd) => {
        let relatedProdFinalPrice = relatedProd.price;
        let relatedProdDiscountPercentage = 0;

        // Check for a product-specific offer for each related product
        const relatedProductOffer = await Offer.findOne({
          offerType: "product",
          status: "active",
          productIds: relatedProd._id,
        }).exec();

        // Check for a category-specific offer for each related product
        let relatedCategoryOffer = null;
        if (relatedProd.category) {
          relatedCategoryOffer = await Offer.findOne({
            offerType: "category",
            status: "active",
            categoryIds: relatedProd.category._id,
          }).exec();
        }

        if (relatedProductOffer) {
          relatedProdFinalPrice = relatedProd.price - relatedProd.price * (relatedProductOffer.discount / 100);
          relatedProdDiscountPercentage = Math.round(relatedProductOffer.discount);
        }

        if (relatedCategoryOffer && relatedCategoryOffer.discount > relatedProdDiscountPercentage) {
          relatedProdFinalPrice = relatedProd.price - relatedProd.price * (relatedCategoryOffer.discount / 100);
          relatedProdDiscountPercentage = Math.round(relatedCategoryOffer.discount);
        }

        relatedProd.finalPrice = relatedProdFinalPrice;
        relatedProd.discountPercentage = relatedProdDiscountPercentage;

        return relatedProd;
      }),
    );

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
      productOffer,
      categoryOffer,
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

    // Fetch all categories, even those without products
    const categories = await Category.find({ isListed: "true" });

    // Fetch products and populate their categories
    const products = await Product.find({ isListed: "true" })
      .populate({ path: "category", match: { isListed: "true" }, select: "title" })
      .skip(skip)
      .limit(limit);

    // Loop through each product and calculate the offer price and discount
    for (let product of products) {
      // Fetch product-specific offer
      const productOffer = await Offer.findOne({
        offerType: "product",
        status: "active",
        productIds: product._id,
      }).exec();

      let categoryOffer = null;
      if (product.category) {
        // Fetch category-specific offer if no product-specific offer is found
        categoryOffer = await Offer.findOne({
          offerType: "category",
          status: "active",
          categoryIds: product.category._id,
        }).exec();
      }

      // Calculate the final price and discount percentage
      let finalPrice = product.price;
      let discountPercentage = 0;

      if (productOffer) {
        finalPrice = product.price - product.price * (productOffer.discount / 100);
        discountPercentage = Math.round(productOffer.discount);
      }

      if (categoryOffer && categoryOffer.discount > discountPercentage) {
        finalPrice = product.price - product.price * (categoryOffer.discount / 100);
        discountPercentage = Math.round(categoryOffer.discount);
      }

      // Attach the offer details to the product
      product.finalPrice = finalPrice;
      product.discountPercentage = discountPercentage;
    }

    // Calculate total pages
    const totalProducts = await Product.countDocuments({ isListed: "true" });
    const totalPages = Math.ceil(totalProducts / limit);
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;

    // Fetch wishlist items
    let wishlistItems = [];
    if (userId) {
      const wishlist = await Wishlist.findOne({ userId }).populate("products.productId");
      wishlistItems = wishlist ? wishlist.products : [];
    }

    // Fetch cart items
    let cartItems = [];
    if (userId) {
      const cart = await Cart.findOne({ userId }).populate("items.productId");
      cartItems = cart ? cart.items : [];
    }

    // Render the view and pass the necessary data
    res.render("product-list", {
      products,
      categories,
      user,
      currentPage: page,
      totalPages,
      wishlistItems,
      cartItems,
    });
  } catch (error) {
    console.log(error);
  }
};

const filterAndSortProducts = async (req, res) => {
  try {
    const { categories, sort, page = 1 } = req.body;
    const limit = 9;
    const skip = (page - 1) * limit;

    let query = { isListed: true };
    if (categories && categories.length > 0) {
      query.category = { $in: categories };
    }

    let sortOption = {};
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
      default:
        sortOption = { createdAt: -1 };
    }

    const products = await Product.find(query).sort(sortOption).skip(skip).limit(limit).populate("category");

    // Add offer information to each product
    for (let product of products) {
      // Find an active product-specific offer
      const productOffer = await Offer.findOne({
        offerType: "product",
        status: "active",
        productId: product._id,
      }).exec();

      // Find an active category-specific offer, if no product offer is found
      let categoryOffer = null;
      if (!productOffer) {
        categoryOffer = await Offer.findOne({
          offerType: "category",
          status: "active",
          categoryId: product.category._id,
        }).exec();
      }
      product.offer = productOffer || categoryOffer;
    }

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    res.json({
      products,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error("Error in filter and sort:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

//load wishlist page who have account
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

const searchProduct = async (req, res) => {
  try {
    const query = req.query.q.toLowerCase();
    const products = await Product.find({
      $or: [{ name: { $regex: query, $options: "i" } }, { description: { $regex: query, $options: "i" } }],
      isListed: true,
    }).limit(10); // Limit to 10 results for performance

    const results = products.map((product) => ({
      id: product._id,
      name: product.name,
      description: product.description,
      price: product.price,
      image: product.imageUrl_1, // Assuming there's an image field
    }));

    res.json(results);
  } catch (error) {
    console.error("Error in product search:", error);
    res.status(500).json({ error: "An error occurred while searching for products" });
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
  searchProduct,
};
