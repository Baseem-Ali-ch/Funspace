const Coupon = require("../../model/coupen"); // Adjust the path as necessary
const Cart = require("../../model/cartModel");
const Category = require("../../model/categoryModel");
const Product = require("../../model/productModel");
const Offer = require("../../model/offerModel");

// Get all coupons
const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find();
    res.render("coupon-list", { coupons }); // Adjust the view path as necessary
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
    res.redirect("/admin/add-coupon");
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
  const { couponId, coupon_code, description, discount, min_amount, redeem_amount, isActive, expiryDate } = req.body;
  try {
    await Coupon.findByIdAndUpdate(couponId, {
      couponCode: coupon_code,
      discription: description,
      discount,
      minAmount: min_amount,
      redeemAmount: redeem_amount,
      isActive,
      expiryDate,
    });
    res.redirect("/admin/list-coupon");
  } catch (error) {
    console.error("Error updating coupon:", error);
    res.status(500).send("Server Error");
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
    let discount = 0;
    discount = coupon.redeemAmount;

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
      redeemAmount: coupon.redeemAmount.toFixed(2),
      subtotal: cartTotal.toFixed(2),
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const renderAddOfferPage = async (req, res) => {
  try {
    const products = await Product.find();
    const categories = await Category.find();
    const isAdmin = req.session.admin;
    res.render("add-offer", {
      isAdmin,
      products,
      categories,
    });
  } catch (error) {
    console.log(error);
  }
};

const offerList = async (req, res) => {
  try {
    const isAdmin = req.session.admin;
    const offers = await Offer.find().populate("productId categoryId").lean();
    const products = await Product.find();
    const categories = await Category.find();

    res.render("list-offer", { offers, isAdmin, products, categories }); // Adjust the view path as needed
  } catch (error) {
    console.error("Error fetching offers:", error);
    res.status(500).send("Server error");
  }
};

const addOffer = async (req, res) => {
  try {
    const { offerType, offerName, discount, productId, categoryId, referralCode, startDate, endDate } = req.body;

    const newOffer = new Offer({
      offerType,
      offerName,
      discount,
      productId: offerType === "product" ? productId : null,
      categoryId: offerType === "category" ? categoryId : null,
      referralCode: offerType === "referral" ? referralCode : null,
    });

    await newOffer.save();
    res.status(200).json({ success: true, message: "Offer added successfully." });
  } catch (error) {
    console.error("Error adding offer:", error);
    res.status(500).json({ success: false, message: "Error adding offer." });
  }
};

const editOffer = async (req, res) => {
  const { offerId } = req.body;
  const { offerName, discount, offerType, status } = req.body;

  try {
    const offer = await Offer.findByIdAndUpdate(
      offerId,
      {
        offerName,
        discount,
        offerType,
        status,
      },
      { new: true },
    );

    if (offer) {
      res.json({ success: true, offer });
    } else {
      res.json({ success: false, message: "Offer not found" });
    }
  } catch (error) {
    console.error("Error updating offer:", error);
    res.json({ success: false, message: "Error updating offer" });
  }
};

const deleteOffer = async (req, res) => {
  try {
    const { offerId } = req.params;

    await Offer.findByIdAndDelete(offerId);
    res.status(200).json({ success: true, message: "Offer deleted successfully." });
  } catch (error) {
    console.error("Error deleting offer:", error);
    res.status(500).json({ success: false, message: "Error deleting offer." });
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
  applyCoupon,
  renderAddOfferPage,
  offerList,
  addOffer,
  editOffer,
  deleteOffer,
};
