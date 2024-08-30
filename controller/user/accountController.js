//controllers
const Token = require("../../model/tokenModel");
const Category = require("../../model/categoryModel");
const userModel = require("../../model/userModel");
const Wishlist = require("../../model/wishlistModel");
const Cart = require("../../model/cartModel");
const Address = require("../../model/addressModel");
const Order = require("../../model/orderModel");
const Wallet = require("../../model/walletModel");
const Offer = require("../../model/offerModel");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

const nodemailer = require("nodemailer");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const path = require('path')
const PDFDocument = require('pdfkit');
const fs = require('fs');


const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const loadProfile = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;
    console.log("user session:", user);

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
    const orders = await Order.find({ user: userId }).populate("items.product").populate("address");

    // Calculate the total amount for each order based on the offer price or regular price
    for (let order of orders) {
      let totalPrice = 0;

      for (let item of order.items) {
        let finalPrice = item.product.price;

        // Check for product and category offers
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

        let bestOffer = null;
        if (productOffer && categoryOffer) {
          bestOffer = productOffer.discount > categoryOffer.discount ? productOffer : categoryOffer;
        } else {
          bestOffer = productOffer || categoryOffer;
        }

        if (bestOffer) {
          finalPrice = item.product.price * (1 - bestOffer.discount / 100);
        }

        totalPrice += finalPrice * item.quantity;
        item.product.finalPrice = finalPrice.toFixed(2); // Save the final price for display
      }

      order.totalPrice = totalPrice.toFixed(2);
    }

    const userDetails = user
      ? {
          fullName: user.name,
          displayName: user.displayName || user.name,
          phone: user.phone,
          email: user.email,
        }
      : null;

    res.render("account", {
      user: userDetails,
      categories,
      wishlistItems,
      cartItems,
      orders,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

//user can edit their own
const updateProfile = async (req, res) => {
  try {
    const userId = req.session.user ? req.session.user._id : req.user ? req.user._id : null;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User not found" });
    }

    const fullName = req.body.fullName; // Assuming fullName is a single string
    let displayName = req.body.displayName;
    const updatedUser = await userModel.findByIdAndUpdate(
      userId,
      {
        name: fullName,
        displayName: displayName,
        phone: req.body.phone,
        email: req.body.email,
      },
      { new: true },
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    req.session.user = updatedUser;
    res.json({
      success: true,
      fullName: updatedUser.name,
      displayName: updatedUser.displayName,
      phone: updatedUser.phone,
      email: updatedUser.email,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

//load forget password
const forgetPassword = async (req, res) => {
  try {
    res.render("forgetPassword");
  } catch (error) {
    console.log(error);
  }
};

//load forget password page and send a token to email
const verifyForgetPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email address" });
    }

    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const token = crypto.randomBytes(20).toString("hex");

    await Token.create({ userId: user._id, token, createdAt: Date.now() });

    const resetUrl = `http://localhost:5068/reset-password?token=${token}&id=${user._id}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset",
      text: `You requested a password reset. Click the link to reset your password: ${resetUrl}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Failed to send email" });
      }
      res.json({ success: true, message: "Password reset link sent" });
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

//load reset password page
const resetPasswordPage = async (req, res) => {
  try {
    const { token, id } = req.query;
    const tokenDoc = await Token.findOne({ token, userId: id });

    if (!tokenDoc) {
      return res.status(400).send("Invalid or expired token");
    }

    res.render("resetPassword", { token, userId: id });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

//reset the password
const resetPassword = async (req, res) => {
  try {
    const { token, userId, password } = req.body;

    const tokenDoc = await Token.findOne({ token, userId });
    if (!tokenDoc) {
      return res.status(400).json({ success: false, message: "Invalid or expired token" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await userModel.findByIdAndUpdate(userId, { password: hashedPassword });
    await Token.findByIdAndDelete(tokenDoc._id);

    res.json({ success: true, message: "Password reset successful" });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

// add new address
const addAddress = async (req, res) => {
  try {
    const user = req.session.user || req.user; // Get user from session or request
    const userId = user ? user._id : null;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const addressData = { ...req.body, userId }; // Set userId
    const address = new Address(addressData);
    await address.save();

    res.status(201).json({ success: true, message: "Address added successfully", address });
  } catch (error) {
    console.error("Error adding address:", error);
    res.status(500).json({ success: false, message: "Error adding address" });
  }
};

const getAddress = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const addresses = await Address.find({ userId }); // Fetch addresses for the user
    res.json({ success: true, addresses });
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).json({ success: false, message: "Error fetching addresses" });
  }
};

const updateAddress = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const addressId = req.params.id;
    const updatedData = req.body;

    // Ensure address belongs to the user
    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found or unauthorized" });
    }

    // Update the address
    const updatedAddress = await Address.findByIdAndUpdate(addressId, updatedData, { new: true });

    res.json({ success: true, message: "Address updated successfully", address: updatedAddress });
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(500).json({ success: false, message: "Error updating address" });
  }
};

const deleteAddress = async (req, res) => {
  console.log("Delete address request received:", req.params);
  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const addressId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ success: false, message: "Invalid address ID" });
    }

    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found or unauthorized" });
    }

    await Address.findByIdAndDelete(addressId);
    res.json({ success: true, message: "Address deleted successfully" });
  } catch (error) {
    console.error("Error deleting address:", error);
    res.status(500).json({ success: false, message: "Error deleting address" });
  }
};

const changePassword = async (req, res) => {
  try {
    res.render("change-password");
  } catch (error) {
    console.log(error);
  }
};

const changedPassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const user = req.session.user || req.user;
  const userId = user ? user._id : null; // Assuming you have the user ID stored in the session

  // Validate new passwords match
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New passwords do not match." });
  }

  try {
    // Fetch user from database
    const user = await userModel.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    user.password = hashedPassword;
    await user.save();

    res.json({ success: "Password changed successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred." });
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

const loadWallet = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    console.log("User from session:", user);
    const userId = user ? user._id : null;

    if (!userId) {
      return res.status(401).render("login", { message: "Please log in to view your wallet" });
    }

    const wishlistItems = await Wishlist.findOne({ userId }).populate("products.productId");
    const categories = await Category.find({ isListed: "true" });

    let cartItems = [];
    if (userId) {
      const cart = await Cart.findOne({ userId }).populate("items.productId");
      cartItems = cart ? cart.items : [];
    }

    // Fetch the wallet
    
    const wallet = await Wallet.findOne({ user: userId });

    res.render("wallet", {
      user,
      wishlistItems: wishlistItems ? wishlistItems.products : [], // Handle null wishlistItems
      categories,
      cartItems,
      transactions: wallet?.transactions,
      wallet,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "An error occurred." });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

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

      console.log("Updated wallet:", wallet); // Add this for debugging

      return res.status(200).json({ success: true, message: "Order status updated and amount credited to wallet successfully" });
    } else {
      return res.status(200).json({ success: true, message: "Order status updated successfully" });
    }
  } catch (error) {
    console.error("Error updating order status:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

const loadOrderList = async (req, res) => {
  const { search = "", page = 1 } = req.query;
  const limit = 10;
  const skip = (page - 1) * limit;

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

    const searchQuery = search
      ? {
          $or: [
            { orderId: new RegExp(search, "i") },
            { "address.fullName": new RegExp(search, "i") },
            ...(mongoose.Types.ObjectId.isValid(search) ? [{ _id: mongoose.Types.ObjectId(search) }] : []),
          ],
          user: userId,
        }
      : { user: userId };

    const totalOrders = await Order.countDocuments(searchQuery);

    const orders = await Order.find(searchQuery)
      .populate("items.product")
      .populate("address")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    for (let order of orders) {
      let totalPrice = 0;

      for (let item of order.items) {
        let finalPrice = item.product.price;
        let offerDetails = null;

        if (item.product) {
          // Check for product-specific offers
          const productOffers = await Offer.find({
            offerType: "product",
            status: "active",
            _id: { $in: item.product.offerIds || [] }
          }).exec();

          // Check for category-specific offers
          const categoryOffers = await Offer.find({
            offerType: "category",
            status: "active",
            categoryIds: item.product.category
          }).exec();

          let bestOffer = null;
          if (productOffers.length > 0) {
            bestOffer = productOffers.reduce((max, offer) => offer.discount > max.discount ? offer : max, productOffers[0]);
          }

          if (categoryOffers.length > 0) {
            const categoryBestOffer = categoryOffers.reduce((max, offer) => offer.discount > max.discount ? offer : max, categoryOffers[0]);
            if (!bestOffer || categoryBestOffer.discount > bestOffer.discount) {
              bestOffer = categoryBestOffer;
            }
          }

          if (bestOffer) {
            finalPrice = item.product.price * (1 - bestOffer.discount / 100);
            offerDetails = {
              offerType: bestOffer.offerType,
              discount: bestOffer.discount,
              offerName: bestOffer.offerName,
              description: bestOffer.description || "No additional details available",
            };
            item.product.finalPrice = finalPrice.toFixed(2);
            item.product.offerDetails = offerDetails;
          } else {
            item.product.finalPrice = item.product.price.toFixed(2);
            item.product.offerDetails = null;
          }
          

          totalPrice += finalPrice * item.quantity;
          item.product.finalPrice = finalPrice.toFixed(2);
          item.product.offerDetails = offerDetails;
        }
      }

      order.totalPrice = totalPrice.toFixed(2);
    }

    const totalPages = Math.ceil(totalOrders / limit);
    const categories = await Category.find({ isListed: "true" });

    res.render("order-list", {
      wishlistItems,
      cartItems,
      orders,
      categories,
      search,
      currentPage: parseInt(page),
      totalPages,
      userId,
      user,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};






// Route to handle return requests







const loadAddress = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;
    console.log("user session:", user);

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
    res.render("order-list", {
      wishlistItems,
      cartItems,
      categories,
      userId,
      user,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};







const downloadInvoice = async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    
    const order = await Order.findOne({ orderId: orderId })
      .populate('items.product')
      .populate('user');

    if (!order) {
      return res.status(404).send('Order not found');
    }

    const orderItem = order.items.find(item => item.product._id.toString() === productId);

    if (!orderItem) {
      return res.status(404).send('Product not found in the order');
    }

    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}-${productId}.pdf`);

    // Pipe the PDF document to the response
    doc.pipe(res);

    // Add content to the PDF
    doc.fontSize(18).text('Invoice', { align: 'center' });
    doc.moveDown();

    // Define table structure
    const table = {
      headers: ['Field', 'Value'],
      rows: [
        ['Order ID', order.orderId],
        ['Date', order.createdAt.toLocaleDateString()],
        ['Customer', order.address.fullName],
        ['Address', `${order.address.streetAddress}, ${order.address.city}, ${order.address.state}, ${order.address.postcode}`]
      ]
    };

    // Draw table with padding and styling
    const startX = 50;
    let startY = 100;
    const rowHeight = 30;
    const colWidth = (doc.page.width - 100) / 2;
    const cellPadding = 5;

    // Draw headers with bold font and background color
    doc.font('Helvetica-Bold');
    table.headers.forEach((header, i) => {
      doc.rect(startX + i * colWidth, startY, colWidth, rowHeight)
        .fillAndStroke('#f0f0f0', '#000')
        .fill('#000')
        .text(header, startX + i * colWidth + cellPadding, startY + cellPadding, {
          width: colWidth - 2 * cellPadding,
          align: 'left',
          height: rowHeight - 2 * cellPadding
        });
    });

    // Draw rows with padding
    doc.font('Helvetica');
    table.rows.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        doc.rect(startX + colIndex * colWidth, startY + (rowIndex + 1) * rowHeight, colWidth, rowHeight)
          .stroke()
          .text(cell, startX + colIndex * colWidth + cellPadding, startY + (rowIndex + 1) * rowHeight + cellPadding, {
            width: colWidth - 2 * cellPadding,
            align: 'left',
            height: rowHeight - 2 * cellPadding
          });
      });
    });

    // Move to next section
    startY += (table.rows.length + 1) * rowHeight + 10;

    // Product details table
    doc.fontSize(14).text('Product Details', startX, startY);
    startY += 30;

    const productTable = {
      headers: ['Product', 'Quantity', 'Price', 'Total'],
      rows: [[
        orderItem.product.name,
        orderItem.quantity.toString(),
        `₹${orderItem.product.price.toFixed(2)}`,
        `₹${(orderItem.quantity * orderItem.product.price).toFixed(2)}`
      ]]
    };

    // Draw product table with padding and styling
    doc.font('Helvetica-Bold');
    productTable.headers.forEach((header, i) => {
      doc.rect(startX + i * colWidth / 2, startY, colWidth / 2, rowHeight)
        .fillAndStroke('#f0f0f0', '#000')
        .fill('#000')
        .text(header, startX + i * colWidth / 2 + cellPadding, startY + cellPadding, {
          width: colWidth / 2 - 2 * cellPadding,
          align: 'center',
          height: rowHeight - 2 * cellPadding
        });
    });

    doc.font('Helvetica');
    productTable.rows[0].forEach((cell, i) => {
      doc.rect(startX + i * colWidth / 2, startY + rowHeight, colWidth / 2, rowHeight)
        .stroke()
        .text(cell, startX + i * colWidth / 2 + cellPadding, startY + rowHeight + cellPadding, {
          width: colWidth / 2 - 2 * cellPadding,
          align: 'center',
          height: rowHeight - 2 * cellPadding
        });
    });

    // Move to next section
    startY += 2 * rowHeight + 10;

    // Add total and order status with padding and font size
    doc.fontSize(14).text(`Total: ₹${(orderItem.quantity * orderItem.product.price).toFixed(2)}`, startX, startY, { align: 'right' });
    startY += rowHeight;
    doc.fontSize(12).text(`Order Status: ${orderItem.order_status}`, startX, startY);

    // Finalize the PDF and end the stream
    doc.end();

  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating invoice');
  }
};


module.exports = {
  loadProfile,
  updateProfile,
  forgetPassword,
  verifyForgetPassword,
  resetPasswordPage,
  resetPassword,
  addAddress,
  updateAddress,
  deleteAddress,
  getAddress,
  changePassword,
  changedPassword,
  loadWallet,
  updateOrderStatus,
  loadOrderList,
  loadAddress,
  downloadInvoice
};
