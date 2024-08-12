//require model
const Wishlist = require("../../model/wishlistModel");
const Cart = require("../../model/cartModel");
const Order = require("../../model/orderModel");
const Address = require("../../model/addressModel");
const Category = require("../../model/categoryModel");
const Payment = require("../../model/paymentModel");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const Wallet = require("../../model/walletModel");
const Coupon = require("../../model/coupen");
const Offer = require("../../model/offerModel");
const Proudct = require("../../model/productModel");
//load the check out page
const loadCheckout = async (req, res) => {
  try {
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

    // If there's a discount, set the discountedPrice for each cart item
    cartItems = await Promise.all(
      cartItems.map(async (item) => {
        // Fetch the offers for the item
        const productOffer = await Offer.findOne({
          offerType: "product",
          status: "active",
          productId: item.productId._id,
        }).exec();

        const categoryOffer = await Offer.findOne({
          offerType: "category",
          status: "active",
          categoryId: item.productId.category,
        }).exec();

        // Apply the highest offer available (either product or category)
        let bestOffer = null;
        if (productOffer && categoryOffer) {
          bestOffer = productOffer.discount > categoryOffer.discount ? productOffer : categoryOffer;
        } else {
          bestOffer = productOffer || categoryOffer;
        }

        // Attach the best offer to the product
        if (bestOffer) {
          item.productId.offer = bestOffer;
          item.productId.finalPrice = (item.productId.price * (1 - bestOffer.discount / 100)).toFixed(2);
        } else {
          item.productId.finalPrice = item.productId.price;
        }

        return item;
      }),
    );

    const categories = await Category.find({ isListed: "true" });
    const addresses = await Address.find({ userId });

    // Example: Retrieve and apply coupon (replace with your logic)
    const couponCode = req.body.couponCode; // Assuming coupon code is sent in the request
    let couponDiscount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ couponCode: couponCode, isListed: true });
      if (coupon) {
        couponDiscount = coupon.redeemAmount; // Get coupon discount percentage
      }
    }

    // Calculate total amount with coupon discount
    let subtotal = cartItems.reduce((acc, item) => acc + item.productId.finalPrice * item.quantity, 0);
    let discountAmount = (subtotal * couponDiscount) / 100;
    let totalAmount = subtotal - discountAmount;

    res.render("checkout", {
      user,
      wishlistItems,
      cartItems,
      addresses,
      categories,
      subtotal,
      discountAmount,
      totalAmount,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
};

const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createOrderId = async (body, res) => {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    const creds = btoa(`${keyId}:${keySecret}`);
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${creds}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ success: false, message: data.error.description });
      return null;
    }

    return data;
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Error creating order ID" });
    return null;
  }
};

const generateOrderId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let orderId = "#";
  for (let i = 0; i < 5; i++) {
    orderId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return orderId + Date.now().toString().slice(-5); // Append last 5 digits of timestamp
};

// orderController.js

const placeOrder = async (req, res) => {
  const user = req.session.user || req.user;
  const userId = user ? user._id : null;
  const { addressId, paymentMethod, couponCode } = req.body;

  try {
    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ success: false, message: "Invalid address ID" });
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const address = await Address.findById(addressId);
    if (!address) {
      return res.status(400).json({ success: false, message: "Address not found" });
    }

    let totalPrice = 0;
    const orderedItems = await Promise.all(
      cart.items.map(async (item) => {
        // Fetch the best offer for the product
        const productOffer = await Offer.findOne({
          offerType: "product",
          status: "active",
          productId: item.productId._id,
        }).exec();

        const categoryOffer = await Offer.findOne({
          offerType: "category",
          status: "active",
          categoryId: item.productId.category,
        }).exec();

        let bestOffer = null;
        if (productOffer && categoryOffer) {
          bestOffer = productOffer.discount > categoryOffer.discount ? productOffer : categoryOffer;
        } else {
          bestOffer = productOffer || categoryOffer;
        }

        // Apply the best offer to the product
        const finalPrice = bestOffer ? (item.productId.price * (1 - bestOffer.discount / 100)).toFixed(2) : item.productId.price.toFixed(2);

        const itemTotal = finalPrice * item.quantity;
        totalPrice += itemTotal;

        // Update product stock
        const product = await Product.findById(item.productId._id);
        if (!product) {
          throw new Error(`Product with ID ${item.productId._id} not found`);
        }

        const totalStock = product.stock + item.quantity; // Adding the existing quantity back to stock
        if (item.quantity > product.stock) {
          throw new Error(`Requested quantity for product ${item.productId._id} exceeds available stock`);
        }
        product.stock -= item.quantity; // Deduct the ordered quantity
        await product.save();

        return {
          product: item.productId._id,
          quantity: item.quantity,
          price: parseFloat(finalPrice), // Convert to float
        };
      }),
    );

    let couponDiscountAmt = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode });
      if (!coupon) {
        return res.status(404).json({ success: false, message: "Coupon not found." });
      }
      couponDiscountAmt = coupon.redeemAmount; // Assuming redeemAmount is a flat amount
      totalPrice -= couponDiscountAmt;
    }

    totalPrice = Math.max(totalPrice, 0); // Ensure totalPrice does not go below zero

    const razorpayOrder = await createOrderId(
      {
        amount: totalPrice * 100, // Razorpay amount is in paise
        currency: "INR",
        receipt: `order_rcptid_${Date.now()}`,
      },
      res,
    );

    if (!razorpayOrder) {
      return; // Error response already sent by createOrderId function
    }

    const newOrder = new Order({
      user: userId,
      address: address,
      paymentMethod: paymentMethod,
      items: orderedItems,
      totalPrice: totalPrice,
      couponDiscountAmt: couponDiscountAmt, // Store the discount amount
      razorpayOrderId: razorpayOrder.id,
      payment_status: paymentMethod === "Razorpay" ? "Completed" : "Pending",
      orderId: generateOrderId(),
    });

    await newOrder.save();
    await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } }, { new: true });

    res.status(200).json({
      success: true,
      message: "Order placed successfully",
      orderId: newOrder._id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID, // Make sure this line is present
    });
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).json({ message: "Error placing order", success: false });
  }
};

//confirm order page after place a order
const orderConfirm = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;
    const orderId = req.params.orderId;

    if (!ObjectId.isValid(orderId)) {
      return res.status(400).send("Invalid order ID");
    }

    const order = await Order.findById(orderId).populate("items.product").exec();
    if (!order) {
      return res.status(404).send("Order not found");
    }

    // Apply offers to each product in the order
    for (let item of order.items) {
      if (item.product) {
        const productOffer = await Offer.findOne({
          offerType: "product",
          status: "active",
          productId: item.product._id,
        }).exec();

        const categoryOffer = await Offer.findOne({
          offerType: "category",
          status: "active",
          categoryId: item.product.category,
        }).exec();

        // Apply the highest offer available (either product or category)
        let bestOffer = null;
        if (productOffer && categoryOffer) {
          bestOffer = productOffer.discount > categoryOffer.discount ? productOffer : categoryOffer;
        } else {
          bestOffer = productOffer || categoryOffer;
        }

        // Attach the best offer to the product
        if (bestOffer) {
          item.product.offer = bestOffer;
          item.product.discountedPrice = (item.product.price * (1 - bestOffer.discount / 100)).toFixed(2);
        } else {
          item.product.discountedPrice = item.product.price.toFixed(2);
        }
      }
    }

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

    const categories = await Category.find({ isListed: "true" });
    const address = order.address;

    const createdAt = new Date(order.createdAt);
    const deliveryDate = new Date(createdAt);
    deliveryDate.setDate(deliveryDate.getDate() + 3);

    res.render("orderConfirm", {
      order: {
        _id: order._id,
        orderId: order.orderId,
        totalPrice: order.items.reduce((acc, item) => {
          if (item.product) {
            return acc + item.product.discountedPrice * item.quantity;
          }
          return acc;
        }, 0),
        deliveryDate: formatDate(deliveryDate),
        address: {
          name: address.fullName,
          street: address.streetAddress,
          apartment: address.apartment,
          city: address.city,
          town: address.town,
          state: address.state,
          postcode: address.postcode,
          phone: address.phone,
          email: address.email,
        },
        items: order.items,
        paymentStatus: order.paymentMethod === "Razorpay" ? "Completed" : "Pending",
      },
      wishlistItems,
      cartItems,
      user,
      categories,
    });
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).send("Internal Server Error");
  }
};

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const dayOfWeek = days[date.getDay()];
  const month = months[date.getMonth()];
  const dayOfMonth = date.getDate();

  return `${dayOfWeek}, ${month} ${dayOfMonth}`;
}

const updateStatus = async (req, res) => {
  try {
    const { orderId, status, cancellationReason, returnReason } = req.body;

    if (!orderId || !status) {
      return res.status(400).json({ success: false, message: "Order ID and status are required" });
    }

    const order = await Order.findById(orderId).populate("user");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const validStatuses = ["Pending", "Processing", "Shipped", "Delivered", "Cancel", "Returned"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid order status" });
    }

    order.order_status = status;

    if (status === "Cancel") {
      order.cancellationReason = cancellationReason;
    } else if (status === "Returned") {
      order.returnReason = returnReason;
    }

    await order.save();

    if (order.paymentMethod === "Razorpay" && (status === "Cancel" || status === "Returned")) {
      let wallet = await Wallet.findOne({ user: order.user._id });

      const transactionData = {
        transactionId: generateOrderId(),
        date: new Date(),
        description: `Product ${status} Refund`,
        amount: order.totalPrice,
        type: "credit",
      };

      if (wallet) {
        wallet.balance += order.totalPrice;
        wallet.transactions.push(transactionData);
      } else {
        wallet = new Wallet({
          user: order.user._id,
          balance: order.totalPrice,
          transactions: [transactionData],
        });
      }

      await wallet.save();

      return res.status(200).json({ success: true, message: "Order status updated and amount credited to wallet successfully" });
    } else {
      return res.status(200).json({ success: true, message: "Order status updated successfully" });
    }
  } catch (error) {
    console.error("Error updating order status:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

const verifyPayment = async (req, res) => {
  const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;

  const generatedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(razorpayOrderId + "|" + razorpayPaymentId)
    .digest("hex");

  if (generatedSignature === razorpaySignature) {
    try {
      const order = await Order.findById(orderId);
      order.payment_status = "Completed";
      await order.save();

      res.status(200).json({ success: true, orderId: orderId });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ success: false, message: "Error verifying payment" });
    }
  } else {
    res.status(400).json({ success: false, message: "Invalid signature" });
  }
};

const btoa = require("btoa");
const fetch = require("node-fetch");

exports.createOrderId = async (body, res) => {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID; // Ensure correct environment variable name
    const keySecret = process.env.RAZORPAY_KEY_SECRET; // Ensure correct environment variable name

    const creds = btoa(`${keyId}:${keySecret}`);
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${creds}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Razorpay API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Error creating order ID" });
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
  orderConfirm,
  updateStatus,
  verifyPayment,
};
