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
const Product = require("../../model/productModel");

//load the check out page
const loadCheckout = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;

    if (!userId) {
      return res.status(401).send("User not authenticated");
    }

    // Fetch user's wishlist and cart items
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

    // Fetch active offers
    const offers = await Offer.find({ status: "active" });

    // Calculate offers for cart items
    cartItems = await Promise.all(
      cartItems.map(async (item) => {
        const productOffers = offers.filter((offer) => offer.offerType === "product" && offer.productIds.includes(item.productId._id));

        const categoryOffers = offers.filter((offer) => offer.offerType === "category" && offer.categoryIds.includes(item.productId.category));

        let bestOffer = null;
        if (productOffers.length > 0 && categoryOffers.length > 0) {
          const bestProductOffer = productOffers.reduce((a, b) => (a.discount > b.discount ? a : b));
          const bestCategoryOffer = categoryOffers.reduce((a, b) => (a.discount > b.discount ? a : b));
          bestOffer = bestProductOffer.discount > bestCategoryOffer.discount ? bestProductOffer : bestCategoryOffer;
        } else if (productOffers.length > 0) {
          bestOffer = productOffers.reduce((a, b) => (a.discount > b.discount ? a : b));
        } else if (categoryOffers.length > 0) {
          bestOffer = categoryOffers.reduce((a, b) => (a.discount > b.discount ? a : b));
        }
        if (bestOffer) {
          item.productId.finalPrice = (item.productId.price * (1 - bestOffer.discount / 100)).toFixed(2);
        } else {
          item.productId.finalPrice = item.productId.price.toFixed(2);
        }

        return item;
      }),
    );

    const coupons = await Coupon.find();

    // Fetch categories and addresses
    const categories = await Category.find({ isListed: "true" });
    const addresses = await Address.find({ userId });

    // Calculate coupon discount if applied
    const couponCode = req.body.couponCode;
    let couponDiscount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode, isListed: true });
      if (coupon) {
        couponDiscount = coupon.redeemAmount;
      }
    }

    // Calculate subtotal, discount, and total amounts
    let subtotal = cartItems.reduce((acc, item) => acc + parseFloat(item.productId.finalPrice) * item.quantity, 0);
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
      coupons,
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

const createOrderId = async (body) => {
  try {
    const order = await razorpayInstance.orders.create(body);
    return order;
  } catch (err) {
    console.error("Error creating Razorpay order:", err);
    throw err;
  }
};

const verifyPayment = (razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
  const generatedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  return generatedSignature === razorpaySignature;
};

const generateOrderId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let orderId = "#";
  for (let i = 0; i < 5; i++) {
    orderId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return orderId + Date.now().toString().slice(-5);
};

const placeOrder = async (req, res) => {
  const user = req.session.user || req.user;
  const userId = user ? user._id : null;
  const { addressId, paymentMethod, couponCode, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;

  try {
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ success: false, message: "Invalid address ID" });
    }

    const [cart, address] = await Promise.all([
      Cart.findOne({ userId }).populate("items.productId"),
      Address.findById(addressId)
    ]);

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    if (!address) {
      return res.status(400).json({ success: false, message: "Address not found" });
    }

    let totalPrice = 0;
    const orderedItems = await Promise.all(
      cart.items.map(async (item) => {
        const [productOffer, categoryOffer] = await Promise.all([
          Offer.findOne({ offerType: "product", status: "active", productId: item.productId._id }),
          Offer.findOne({ offerType: "category", status: "active", categoryId: item.productId.category })
        ]);

        const bestOffer = productOffer && categoryOffer
          ? (productOffer.discount > categoryOffer.discount ? productOffer : categoryOffer)
          : (productOffer || categoryOffer);

        const finalPrice = bestOffer 
          ? (item.productId.price * (1 - bestOffer.discount / 100)).toFixed(2) 
          : item.productId.price.toFixed(2);

        const itemTotal = parseFloat(finalPrice) * item.quantity;
        totalPrice += itemTotal;

        const product = await Product.findById(item.productId._id);
        if (!product) {
          throw new Error(`Product with ID ${item.productId._id} not found`);
        }

        if (item.quantity > product.stock) {
          throw new Error(`Requested quantity for product ${item.productId._id} exceeds available stock`);
        }
        product.stock -= item.quantity;
        await product.save();

        return {
          product: item.productId._id,
          quantity: item.quantity,
          price: parseFloat(item.productId.price),
          discountedPrice: parseFloat(finalPrice),
          offerDiscount: bestOffer ? bestOffer.discount : 0,
        };
      })
    );

    if (paymentMethod === "COD" && totalPrice > 1000) {
      return res.status(400).json({ success: false, message: "Cash on Delivery is not allowed for orders above ₹1000" });
    }

    let couponDiscountAmt = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode });
      if (!coupon) {
        return res.status(404).json({ success: false, message: "Coupon not found." });
      }
      couponDiscountAmt = coupon.redeemAmount;
      totalPrice -= couponDiscountAmt;
    }

    totalPrice = Math.max(totalPrice, 0);

    let razorpayOrder;
    let walletTransaction;

    if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet || wallet.balance < totalPrice) {
        return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
      }

      wallet.balance -= totalPrice;
      walletTransaction = {
        transactionId: `ORDER-${Date.now()}`,
        description: "Order payment",
        amount: totalPrice,
        type: "debit",
      };
      wallet.transactions.push(walletTransaction);
      await wallet.save();
    } else if (paymentMethod === "Razorpay") {
      try {
        razorpayOrder = await createOrderId({
          amount: Math.round(totalPrice * 100),
          currency: "INR",
          receipt: `order_rcptid_${Date.now()}`,
        });

        // Verify payment after creating the order
        if (!verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
          return res.status(400).json({ success: false, message: "Payment verification failed." });
        }

      } catch (error) {
        console.error("Error creating Razorpay order:", error);
        return res.status(500).json({ success: false, message: "Error creating Razorpay order" });
      }
    }

    const newOrder = new Order({
      user: userId,
      address: address,
      paymentMethod: paymentMethod,
      items: orderedItems,
      totalPrice: totalPrice,
      couponDiscountAmt: couponDiscountAmt,
      razorpayOrderId: razorpayOrder ? razorpayOrder.id : null,
      payment_status: paymentMethod === "Wallet" ? "Completed" : "Pending",
      orderId: generateOrderId(),
    });

    await newOrder.save();
    await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } }, { new: true });

    const responseData = {
      success: true,
      message: "Order placed successfully",
      orderId: newOrder._id,
    };

    if (paymentMethod === "Razorpay") {
      responseData.razorpayOrderId = razorpayOrder.id;
      responseData.amount = razorpayOrder.amount;
      responseData.currency = razorpayOrder.currency;
      responseData.key = process.env.RAZORPAY_KEY_ID;
    } else if (paymentMethod === "Wallet") {
      responseData.walletTransaction = walletTransaction;
    }

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).json({ success: false, message: "Error placing order", error: error.message });
  }
};



//confirm order page after place a order
const orderConfirm = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;
    const orderId = req.params.orderId;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).send("Invalid order ID");
    }

    const order = await Order.findById(orderId).populate("items.product").exec();
    if (!order) {
      return res.status(404).send("Order not found");
    }

    // Calculate the best offers for each product in the order
    for (let item of order.items) {
      if (item.product) {
        // Fetch active offers for the product
        const productOffer = await Offer.findOne({
          offerType: "product",
          status: "active",
          productIds: item.product._id,
        }).exec();

        // Fetch active offers for the product's category
        const categoryOffer = await Offer.findOne({
          offerType: "category",
          status: "active",
          categoryIds: item.product.category,
        }).exec();

        // Determine the best offer (product or category)
        let bestOffer = null;
        if (productOffer && categoryOffer) {
          bestOffer = productOffer.discount > categoryOffer.discount ? productOffer : categoryOffer;
        } else {
          bestOffer = productOffer || categoryOffer;
        }

        // Apply the best offer and calculate the discounted price
        if (bestOffer) {
          item.product.offer = bestOffer;
          item.product.discountedPrice = (item.product.price * (1 - bestOffer.discount / 100)).toFixed(2);
        } else {
          item.product.discountedPrice = item.product.price.toFixed(2);
        }
      }
    }

    // Fetch wishlist and cart items for the user
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

    // Fetch categories for the view
    const categories = await Category.find({ isListed: "true" });

    // Calculate delivery date (3 days from order date)
    const createdAt = new Date(order.createdAt);
    const deliveryDate = new Date(createdAt);
    deliveryDate.setDate(deliveryDate.getDate() + 3);

    // Calculate the total price with offers applied
    const totalPrice = order.items.reduce((acc, item) => {
      if (item.product) {
        return acc + parseFloat(item.product.discountedPrice) * item.quantity;
      }
      return acc;
    }, 0);

    // Render the order confirmation page with updated offer details
    res.render("orderConfirm", {
      order: {
        _id: order._id,
        orderId: order.orderId,
        totalPrice,
        deliveryDate: formatDate(deliveryDate),
        address: {
          name: order.address.fullName,
          street: order.address.streetAddress,
          apartment: order.address.apartment,
          city: order.address.city,
          town: order.address.town,
          state: order.address.state,
          postcode: order.address.postcode,
          phone: order.address.phone,
          email: order.address.email,
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

// const verifyPayment = async (req, res) => {
//   const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;

//   // Validate input
//   if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
//     return res.status(400).json({ success: false, message: "Missing required payment information" });
//   }

//   try {
//     const generatedSignature = crypto
//       .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//       .update(razorpayOrderId + "|" + razorpayPaymentId)
//       .digest("hex");

//     if (generatedSignature === razorpaySignature) {
//       // Use orderId to find the order, as it's the field defined in the schema
//       // const order = await Order.findOne({ orderId: razorpayOrderId });
//       const order = await Order.findOne({ razorpayOrderId: razorpayOrderId });


//       if (!order) {
//         console.error(`Order not found for orderId: ${razorpayOrderId}`);
//         return res.status(404).json({ success: false, message: "Order not found" });
//       }

//       order.payment_status = "Completed";
//       order.razorpayPaymentId = razorpayPaymentId;
//       await order.save();

//       return res.status(200).json({ success: true, orderId: order._id });
//     } else {
//       return res.status(400).json({ success: false, message: "Invalid signature" });
//     }
//   } catch (error) {
//     console.error("Error in verifyPayment:", error);
//     return res.status(500).json({ success: false, message: "Error verifying payment", error: error.message });
//   }
// };


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

const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { cancelReason } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).send("Order not found");
    }

    // Increase stock for each item in the order
    for (const item of order.items) {
      const product = await Product.findById(item.product._id);
      if (product) {
        product.stock += item.quantity;
        await product.save();
      }
    }

    // Check if the order payment status is Razorpay or Paid
    if (order.paymentMethod === "Razorpay" || order.payment_status === "Completed") {
      // Calculate the total amount to be refunded
      const refundAmount = order.items.reduce((total, item) => {
        return total + item.discountedPrice * item.quantity;
      }, 0);

      // Find or create the user's wallet
      let wallet = await Wallet.findOne({ user: order.user });
      if (!wallet) {
        wallet = new Wallet({ user: order.user, balance: 0 });
      }

      // Add the refund amount to the wallet balance
      wallet.balance += refundAmount;

      // Add a transaction record
      wallet.transactions.push({
        transactionId: `${order._id}`,
        description: `Refund for cancelled order`,
        amount: refundAmount,
        type: "credit",
      });

      await wallet.save();

      console.log(`Refunded ${refundAmount} to user's wallet for order ${order._id}`);
    }

    // Update the order status and reason for cancellation for each item
    order.items.forEach((item) => {
      item.order_status = "Cancelled";
      item.cancelReason = cancelReason; // Save cancel reason for each item
    });

    // Update the overall order status
    order.status = "Cancelled";
    order.cancelledAt = new Date();

    await order.save();
    res.redirect("/order-list?status=cancelled");
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

const returnOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { returnReason } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).send("Order not found");
    }

    // Increase stock for each item in the order
    for (const item of order.items) {
      const product = await Product.findById(item.product._id);
      if (product) {
        product.stock += item.quantity;
        await product.save();
      }
    }

    // Check if the order payment status is Razorpay or Paid
    if (order.paymentMethod === "Razorpay" || order.payment_status === "Completed") {
      // Calculate the total amount to be refunded
      const refundAmount = order.items.reduce((total, item) => {
        return total + item.discountedPrice * item.quantity;
      }, 0);

      // Find or create the user's wallet
      let wallet = await Wallet.findOne({ user: order.user });
      if (!wallet) {
        wallet = new Wallet({ user: order.user, balance: 0 });
      }

      // Add the refund amount to the wallet balance
      wallet.balance += refundAmount;

      // Add a transaction record
      wallet.transactions.push({
        transactionId: `REFUND-${order._id}`,
        description: `Refund for returned order`,
        amount: refundAmount,
        type: "credit",
      });

      await wallet.save();

      console.log(`Refunded ${refundAmount} to user's wallet for order ${order._id}`);
    }

    // Update the order status and reason for return for each item
    order.items.forEach((item) => {
      item.order_status = "Returned";
      item.returnReason = returnReason; // Save return reason for each item
    });

    // Update the overall order status
    order.status = "Returned";
    order.returnedAt = new Date();

    await order.save();
    res.redirect("/order-list?status=returned");
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

const returnRequest = async (req, res) => {
  try {
    const { orderId, itemId, returnReason } = req.body;
    const userId = req.session.user._id;

    if (!orderId || !itemId || !returnReason) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ success: false, message: "Invalid order ID or item ID" });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: userId,
      "items._id": itemId,
      "items.order_status": { $ne: "Delivered" }, // Ensure the order status is not "Delivered" (or another condition as needed)
    });

    if (!order) {
      return res.status(400).json({ success: false, message: "Order or item not found or not eligible for return" });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    // Update the item status and order status
    item.order_status = "Return Requested";
    item.returnRequested = true;
    item.returnReason = returnReason;

    order.returnRequestStatus = "Pending";
    await order.save();

    res.redirect("/order-list?status=returnRequested");
  } catch (error) {
    console.error("Error submitting return request:", error);
    res.status(500).json({ success: false, message: "Failed to submit return request" });
  }
};

// orderController.js

const razorpayFailure = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    order.payment_status = "Failed";
    await order.save();

    res.status(200).json({ success: true, message: "Order status updated to Failed" });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ success: false, message: "Error updating order status" });
  }
};

const retryPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.payment_status !== "Failed") {
      return res.status(400).json({ success: false, message: "Payment status is not Failed" });
    }

    // Create a new Razorpay order
    const razorpayOrder = await createOrderId(
      {
        amount: order.totalPrice * 100,
        currency: "INR",
        receipt: `order_rcptid_${Date.now()}`,
      },
      res,
    );

    if (!razorpayOrder) {
      return;
    }

    // Update the order with the new Razorpay order details
    order.payment_status = "Completed";
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();
    console.log(order.payment_status);
    console.log(order);
    res.status(200).json({
      success: true,
      message: "Payment retry initiated",
      orderId: order._id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Error retrying payment:", error);
    res.status(500).json({ success: false, message: "Error retrying payment" });
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
  orderConfirm,
  updateStatus,
  verifyPayment,
  cancelOrder,
  returnOrder,
  returnRequest,
  razorpayFailure,
  retryPayment,
};
