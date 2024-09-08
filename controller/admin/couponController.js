const Coupon = require("../../model/coupen"); // Adjust the path as necessary
const Cart = require("../../model/cartModel");
const Category = require("../../model/categoryModel");
const Product = require("../../model/productModel");
const Offer = require("../../model/offerModel");
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

//======================================== Get all coupons=============================
const getCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10; 
    const search = req.query.search || "";

    const skip = (page - 1) * limit;

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
      totalPages: Math.ceil(totalCoupons / limit), 
      search,
    });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).send("Server Error");
  }
};


//======================================== Get coupon=============================
const getCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    res.json(coupon);
  } catch (error) {
    res.status(500).send("Server Error");
  }
};

//=============================Show form to create a new coupon===========================
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

//=======================================Create a new coupon====================================
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

//===================================Show form to edit a coupon===============================================
const editCouponForm = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    res.render("admin/editCoupon", { coupon });
  } catch (error) {
    res.status(500).send("Server Error");
  }
};

//==========================================Update a coupon======================================
const updateCoupon = async (req, res) => {
  const couponId = req.params.id;
  const { coupon_code, description, discount, min_amount, redeem_amount, isListed, expiryDate } = req.body;

  try {
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

//===========================================Delete a coupon==========================================
const deleteCoupon = async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.redirect("/admin/coupons");
  } catch (error) {
    res.status(500).send("Server Error");
  }
};

//=========================================apply coupon for products==========================================
const applyCoupon = async (req, res) => {
  const { couponCode } = req.body;

  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in to apply a coupon" });
    }

    const coupon = await Coupon.findOne({ couponCode: couponCode });
    if (!coupon) {
      return res.status(400).json({ success: false, message: "Invalid coupon code" });
    }

    if (coupon.validTo < new Date() || coupon.validFrom > new Date()) {
      return res.status(400).json({ success: false, message: "Coupon expired" });
    }

    if (coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");

    if (!cart || !cart.items) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    let totalPrice = 0;
    let totalDiscountedPrice = 0;

    for (let item of cart.items) {
      if (item.productId) {

        const productOffer = await Offer.findOne({
          offerType: "product",
          status: "active",
          productIds: item.productId._id,
        }).exec();

        
        const categoryOffer = await Offer.findOne({
          offerType: "category",
          status: "active",
          categoryIds: item.productId.category,
        }).exec();

        let bestOffer = null;
        if (productOffer && categoryOffer) {
          bestOffer = productOffer.discount > categoryOffer.discount ? productOffer : categoryOffer;
        } else {
          bestOffer = productOffer || categoryOffer;
        }

        let price = item.productId.price;
        let discountedPrice = price;

        if (bestOffer) {
          discountedPrice = (price * (1 - bestOffer.discount / 100)).toFixed(2);
        }

        totalPrice += price * item.quantity;
        totalDiscountedPrice += discountedPrice * item.quantity;
      }
    }

    let discountAmount = totalPrice - totalDiscountedPrice;

    if (totalDiscountedPrice < coupon.minAmount) {
      return res.status(400).json({ success: false, message: "Minimum purchase amount not met for coupon" });
    }

    let couponDiscount;
    if (coupon.redeemAmount > totalDiscountedPrice) {
      couponDiscount = totalDiscountedPrice * 0.5; 
    } else {
      couponDiscount = coupon.redeemAmount;
    }

    const newTotal = totalDiscountedPrice - couponDiscount;

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
