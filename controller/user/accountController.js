//controllers
const Token = require("../../model/tokenModel");
const Category = require("../../model/categoryModel");
const userModel = require("../../model/userModel");
const Wishlist = require("../../model/wishlistModel");
const Cart = require("../../model/cartModel");
const Address = require("../../model/addressModel");
const Order = require("../../model/orderModel");
const Wallet = require("../../model/walletModel");

const nodemailer = require("nodemailer");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

//load user profile
// const loadProfile = async (req, res) => {
//   try {
//     const user = req.session.user || req.user;
//     const categories = await Category.find({ isListed: "true" });
//     res.render("profile", { user, categories });
//   } catch (error) {
//     console.log(error);
//   }
// };
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

    const userDetails = user
      ? {
          fullName: user.name,
          displayName: user.displayName || user.name,
          phone: user.phone,
          email: user.email,
        }
      : null;
    console.log("user details", userDetails);
    res.render("account", {
      user: userDetails,
      categories,
      wishlistItems,
      cartItems,
      orders,
    });
  } catch (error) {
    console.log(error);
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

    const resetUrl = `http://localhost:5058/reset-password?token=${token}&id=${user._id}`;
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
    const { fullName, streetAddress, apartment, town, city, state, postcode, phone, email } = req.body;
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;
    const newAddress = new Address({
      fullName,
      streetAddress,
      apartment,
      town,
      city,
      state,
      postcode,
      phone,
      email,
      userId,
    });

    await newAddress.save();
    res.status(200).json({ message: "Address saved successfully", success: true });
  } catch (error) {
    console.log("Error saving address", error);
    res.status(500).json({ message: "Error saving address", success: false });
  }
};

const loadAddress = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID not found." });
    }

    console.log("Fetching addresses for userId:", userId);

    const addresses = await Address.find({ userId: userId });

    res.status(200).json({ success: true, addresses });
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).json({ success: false, message: "Error fetching addresses." });
  }
};

// Assuming you have an endpoint to fetch all addresses
const getAddress = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID not found." });
    }
    const addresses = await Address.find({ userId }); // Fetch all addresses
    res.status(200).json({ success: true, addresses }); // Return addresses as an array
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching addresses." });
  }
};

const updateAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const { fullName, streetAddress, apartment, town, city, state, postcode, phone, email } = req.body;
    await Address.findByIdAndUpdate(addressId, { fullName, streetAddress, apartment, town, city, state, postcode, phone, email });
    res.status(200).json({ success: true, message: "Address updated successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating address." });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    await Address.findByIdAndDelete(addressId);
    res.status(200).json({ success: true, message: "Address deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting address." });
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
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let orderId = '#';
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
      transactions: wallet.transactions,
      wallet 
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

module.exports = {
  loadProfile,
  updateProfile,
  forgetPassword,
  verifyForgetPassword,
  resetPasswordPage,
  resetPassword,
  addAddress,
  loadAddress,
  updateAddress,
  deleteAddress,
  getAddress,
  changePassword,
  changedPassword,
  loadWallet,
  updateOrderStatus,
};
