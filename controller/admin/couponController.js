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
    
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in to apply a coupon" });
    }

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

    // Fetch the user's cart
    const cart = await Cart.findOne({ userId }).populate("items.productId");

    if (!cart || !cart.items) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // Calculate the cart total using the offer price if available
    let totalPrice = 0;
    let totalDiscountedPrice = 0;

    for (let item of cart.items) {
      if (item.productId) {
        // Find active product-specific offers
        const productOffer = await Offer.findOne({
          offerType: "product",
          status: "active",
          productIds: item.productId._id,
        }).exec();

        // Find active category-specific offers
        const categoryOffer = await Offer.findOne({
          offerType: "category",
          status: "active",
          categoryIds: item.productId.category,
        }).exec();

        // Apply the highest offer available (either product or category)
        let bestOffer = null;
        if (productOffer && categoryOffer) {
          bestOffer = productOffer.discount > categoryOffer.discount ? productOffer : categoryOffer;
        } else {
          bestOffer = productOffer || categoryOffer;
        }

        // Calculate the discounted price based on the best offer
        let price = item.productId.price;
        let discountedPrice = price;

        if (bestOffer) {
          discountedPrice = (price * (1 - bestOffer.discount / 100)).toFixed(2);
        }

        // Add to total calculations
        totalPrice += price * item.quantity;
        totalDiscountedPrice += discountedPrice * item.quantity;
      }
    }

    // Calculate the discount difference
    let discountAmount = totalPrice - totalDiscountedPrice;

    // Check if the cart total meets the minimum amount required by the coupon
    if (totalDiscountedPrice < coupon.minAmount) {
      return res.status(400).json({ success: false, message: "Minimum purchase amount not met for coupon" });
    }

    // Calculate the coupon discount
    let couponDiscount;
    if (coupon.redeemAmount > totalDiscountedPrice) {
      couponDiscount = totalDiscountedPrice * 0.5; // If redeem amount exceeds total, apply a 50% discount
    } else {
      couponDiscount = coupon.redeemAmount;
    }

    // Calculate the new total after applying the coupon
    const newTotal = totalDiscountedPrice - couponDiscount;

    // Save coupon usage and updated total
    coupon.usedCount += 1;
    await coupon.save();

    res.json({
      success: true,
      message: "Coupon applied successfully!",
      newTotal: newTotal.toFixed(2),
      couponDiscount: couponDiscount.toFixed(2),
      subtotal: totalDiscountedPrice.toFixed(2),
      originalTotal: totalPrice.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
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
