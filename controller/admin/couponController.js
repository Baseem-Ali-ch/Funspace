const Coupon = require("../../model/coupen"); // Adjust the path as necessary
const Cart = require("../../model/cartModel");
const Category = require("../../model/categoryModel");
const Product = require("../../model/productModel");
const Offer = require("../../model/offerModel");
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Get all coupons
const getCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page
    const search = req.query.search || ""; // Search query

    const skip = (page - 1) * limit;

    // Search for coupons based on query
    const query = search
      ? {
          $or: [{ couponCode: new RegExp(search, "i") }, { description: new RegExp(search, "i") }],
        }
      : {};

    const coupons = await Coupon.find(query).skip(skip).limit(limit).exec();

    const totalCoupons = await Coupon.countDocuments(query);

    res.render("coupon-list", {
      coupons,
      currentPage: page,
      totalPages: Math.ceil(totalCoupons / limit), // Total pages
      search, // Pass search term to the view
    });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).send("Server Error");
  }
};

const getCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    res.json(coupon);
  } catch (error) {
    res.status(500).send("Server Error");
  }
};

// Show form to create a new coupon
const newCouponForm = (req, res) => {
  try {
    const isAdmin = req.session.admin;
    res.render("add-coupon", {
      isAdmin,
    });
  } catch (error) {
    console.log(error);
  }
};

// Create a new coupon
const createCoupon = async (req, res) => {
  const { coupon_code, description, discount, min_amount, redeem_amount, expiryDate, isListed } = req.body;
  try {
    const newCoupon = new Coupon({
      couponCode: coupon_code,
      discription: description,
      discount: discount,
      minAmount: min_amount,
      redeemAmount: redeem_amount,
      expiryDate: expiryDate,
      isListed: isListed === "true",
    });
    await newCoupon.save();
    res.redirect("/admin/add-coupon?success=true");
  } catch (error) {
    console.error("Error saving coupon:", error);
    res.status(500).send("Server Error");
  }
};

// Show form to edit a coupon
const editCouponForm = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    res.render("admin/editCoupon", { coupon }); // Adjust the view path as necessary
  } catch (error) {
    res.status(500).send("Server Error");
  }
};

// Update a coupon
const updateCoupon = async (req, res) => {
  const couponId = req.params.id;
  const { coupon_code, description, discount, min_amount, redeem_amount, isListed, expiryDate } = req.body;

  try {
    // Convert isListed to a boolean
    const isListedBoolean = isListed === "true";

    await Coupon.findByIdAndUpdate(couponId, {
      couponCode: coupon_code,
      description,
      discount,
      minAmount: min_amount,
      redeemAmount: redeem_amount,
      isListed: isListedBoolean,
      expiryDate,
    });

    res.json({ success: true, message: "Coupon updated successfully!" });
  } catch (error) {
    console.error("Error updating coupon:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Delete a coupon
const deleteCoupon = async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.redirect("/admin/coupons");
  } catch (error) {
    res.status(500).send("Server Error");
  }
};

//apply coupon for products
const applyCoupon = async (req, res) => {
  const { couponCode } = req.body;

  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;
    
    // Find the coupon
    const coupon = await Coupon.findOne({ couponCode: couponCode });
    if (!coupon) {
      return res.status(400).json({ success: false, message: "Invalid coupon code" });
    }

    // Check validity dates and usage limits
    if (coupon.validTo < new Date() || coupon.validFrom > new Date()) {
      return res.status(400).json({ success: false, message: "Coupon expired" });
    }

    if (coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
    }

    // Assume cartId is available in the session or as part of the request
    const cart = await Cart.findOne({ userId }).populate("items.productId");

    // Calculate the cart total
    let cartTotal = 0;
    cart.items.forEach((item) => {
      cartTotal += item.quantity * item.productId.price;
    });

    // Check if cart total meets the minimum amount required by the coupon
    if (cartTotal < coupon.minAmount) {
      return res.status(400).json({ success: false, message: "Minimum purchase amount not met" });
    }

    // Calculate discount
    let discount;
    if (coupon.redeemAmount > cartTotal) {
      // If redeem amount is greater than cart total, apply 50% discount
      discount = cartTotal * 0.5;
    } else {
      discount = coupon.redeemAmount;
    }

    // Apply discount to cart total
    const newTotal = cartTotal - discount;

    // Save coupon usage and cart total
    coupon.usedCount += 1;
    await coupon.save();
    cart.total = newTotal;
    cart.redeemAmount = discount;
    await cart.save();

    res.json({
      success: true,
      message: "Coupon applied successfully!",
      newTotal: newTotal.toFixed(2),
      redeemAmount: discount.toFixed(2),
      subtotal: cartTotal.toFixed(2),
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};




module.exports = {
  getCoupons,
  newCouponForm,
  createCoupon,
  editCouponForm,
  updateCoupon,
  deleteCoupon,
  getCoupon,
  applyCoupon
};
