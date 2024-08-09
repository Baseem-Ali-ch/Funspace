const Category = require("../../model/categoryModel");
const Product = require("../../model/productModel");
const Order = require("../../model/orderModel");

const sharp = require("sharp");
const path = require("path");
const fs = require("fs").promises;
const mongoose = require("mongoose");

//load product list in admin side
const loadProductList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const isAdmin = req.session.admin;
    const products = await Product.find().populate("category").skip(skip).limit(limit);
    const categories = await Category.find();
    const totalProducts = await Product.countDocuments();
    const totalPages = Math.ceil(totalProducts / limit);

    return res.render("product-list", {
      products,
      categories,
      isAdmin,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error("Error retrieving product list:", error);
    return res.status(500).send("Server Error");
  }
};

//load add product page
const loadAddProduct = async (req, res) => {
  try {
    const isAdmin = req.session.admin;
    const categories = await Category.find({ isListed: "true" });
    return res.render("add-product", { categories, isAdmin });
  } catch (error) {
    console.log(error);
  }
};

//admin can add product
const addProduct = async (req, res) => {
  try {
    const { productTitle, productDescription, productPrice, productDiscountedPrice, category: categoryId, isListed, stock } = req.body;
    const category = await Category.findById(categoryId);

    if (!category) {
      console.error("Category not found for ID:", categoryId);
      return res.status(404).send("Category not found");
    }

    let imageUrl_1 = req.files["productImage1"] ? "/assets/images/add-product/" + req.files["productImage1"][0].filename : "";
    let imageUrl_2 = req.files["productImage2"] ? "/assets/images/add-product/" + req.files["productImage2"][0].filename : "";
    let imageUrl_3 = req.files["productImage3"] ? "/assets/images/add-product/" + req.files["productImage3"][0].filename : "";

    const cropAndResizeImage = async (imagePath) => {
      const outputFileName = `cropped-${path.basename(imagePath)}`;
      await sharp(imagePath)
        .resize({ width: 300, height: 300 })
        .extract({ width: 300, height: 300, left: 0, top: 0 })
        .toFile(path.join(path.dirname(imagePath), outputFileName));

      return outputFileName;
    };

    if (req.files && req.files["productImage1"]) {
      const croppedImageUrl_1 = await cropAndResizeImage(req.files["productImage1"][0].path);
      imageUrl_1 = `/assets/images/add-product/${croppedImageUrl_1}`;
    }
    if (req.files["productImage2"]) {
      const croppedImageUrl_2 = await cropAndResizeImage(req.files["productImage2"][0].path);
      imageUrl_2 = `/assets/images/add-product/${croppedImageUrl_2}`;
    }
    if (req.files["productImage3"]) {
      const croppedImageUrl_3 = await cropAndResizeImage(req.files["productImage3"][0].path);
      imageUrl_3 = `/assets/images/add-product/${croppedImageUrl_3}`;
    }

    const product = new Product({
      name: productTitle,
      description: productDescription,
      price: productPrice,
      discountedPrice: productDiscountedPrice,
      category: category._id,
      isListed: isListed === "true",
      stock: stock,
      imageUrl_1: imageUrl_1,
      imageUrl_2: imageUrl_2,
      imageUrl_3: imageUrl_3,
    });
    await product.save();

    const cleanUpTempFiles = async (files) => {
      for (const file of files) {
        try {
          await fs.unlink(file.path);
        } catch (error) {
          console.error(`Error deleting temp file for ${file.fieldname}:`, error);
        }
      }
    };

    cleanUpTempFiles(req.files["productImage1"]);
    cleanUpTempFiles(req.files["productImage2"]);
    cleanUpTempFiles(req.files["productImage3"]);

    return res.redirect("/admin/add-product?success=true");
  } catch (error) {
    console.error("Error adding product:", error);
    return res.status(500).send("Server Error");
  }
};

//admin can edit product details
const updateProduct = async (req, res) => {
  const productId = req.params.id;
  const { name, description, category, price, discountPrice, stock, status } = req.body;
  try {
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ success: false, message: "Invalid category ID" });
    }
    const product = await Product.findById(productId);

    if (product) {
      const changes = [];
      if (product.name !== name) changes.push("name");
      if (product.description !== description) changes.push("description");
      if (product.category.toString() !== category) changes.push("category");
      if (product.price !== price) changes.push("price");
      if (product.stock !== stock) changes.push("stock");
      if (product.isListed !== status) changes.push("status");

      if (changes.length === 0) {
        return res.json({ success: false, message: "No changes detected" });
      }

      product.name = name;
      product.description = description;
      product.category = new mongoose.Types.ObjectId(category);
      product.price = price;
      product.discountedPrice = discountPrice;
      product.stock = stock;
      product.isListed = status;

      if (req.files) {
        if (req.files.productImage1) {
          product.imageUrl_1 = "/assets/images/add-product/" + req.files.productImage1[0].filename;
        }
        if (req.files.productImage2) {
          product.imageUrl_2 = "/assets/images/add-product/" + req.files.productImage2[0].filename;
        }
        if (req.files.productImage3) {
          product.imageUrl_3 = "/assets/images/add-product/" + req.files.productImage3[0].filename;
        }
      }

      await product.save();
      res.json({ success: true, product });
    } else {
      res.json({ success: false, message: "Product not found" });
    }
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

//load category list in admin side
const loadCategoryList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const categories = await Category.find().skip(skip).limit(limit);
    const totalCategories = await Category.countDocuments();
    const totalPages = Math.ceil(totalCategories / limit);

    const isAdmin = req.session.admin;

    return res.render("category-list", {
      categories: categories,
      isAdmin,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send("Internal Server Error");
  }
};

//admin can add categories
const addCategory = async (req, res) => {
  try {
    const { title, slug, isListed } = req.body;
    const image = req.file ? req.file.filename : null;

    const existingCategory = await Category.findOne({ title });
    if (existingCategory) {
      return res.status(400).json({ message: "Category already exists" });
    }

    const newCategory = new Category({
      title,
      slug,
      image,
      isListed: isListed === "true",
    });
    await newCategory.save();
    return res.status(201).json({ message: "Category added successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error" });
  }
};

//admin can edit categories
const updateCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const { title, description, status } = req.body;
    const image = req.file ? req.file.filename : null;
    const updateData = {
      title,
      description,
      isListed: status === "active",
    };

    if (image) {
      updateData.image = image;
    }

    const updatedCategory = await Category.findByIdAndUpdate(categoryId, updateData, { new: true });

    if (!updatedCategory) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    res.json({ success: true, message: "Category updated successfully" });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

//sales report
const moment = require("moment");

const salesReport = async (req, res) => {
  try {
    let { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      // Default to last 30 days if no date range is specified
      startDate = moment().subtract(30, "days").format("YYYY-MM-DD");
      endDate = moment().format("YYYY-MM-DD");
    }

    // Parse the dates and set the time
    const startDateTime = moment(startDate).startOf("day");
    const endDateTime = moment(endDate).endOf("day");

    const orders = await Order.find({
      createdAt: { $gte: startDateTime.toDate(), $lte: endDateTime.toDate() },
    })
      .populate("user", "name email")
      .populate("items.product", "name price")
      .sort({ createdAt: -1 });

    let totalRevenue = 0;
    let totalQuantity = 0;

    const salesData = orders.map((order) => {
      const orderTotal = order.totalPrice - order.couponDiscountAmt;
      totalRevenue += orderTotal;

      const orderQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
      totalQuantity += orderQuantity;

      return {
        orderId: order._id,
        date: order.createdAt,
        user: order.user ? `${order.user.name} (${order.user.email})` : "Guest",
        items: order.items.map((item) => ({
          product: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
        })),
        totalQuantity: orderQuantity,
        total: orderTotal,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.payment_status,
        orderStatus: order.order_status,
      };
    });

    res.render("sales-report", {
      salesData,
      totalRevenue,
      totalQuantity,
      title: "Sales Report",
      startDate: startDateTime.format("YYYY-MM-DD"),
      endDate: endDateTime.format("YYYY-MM-DD"),
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("error", { message: "Internal Server Error" });
  }
};

module.exports = {
  loadProductList,
  loadAddProduct,
  addProduct,
  updateProduct,
  loadCategoryList,
  addCategory,
  updateCategory,
  salesReport,
};
