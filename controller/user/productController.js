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
  searchProduct,
};
