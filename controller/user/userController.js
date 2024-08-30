//require model
const Wishlist = require("../../model/wishlistModel");
const Cart = require("../../model/cartModel");
const Product = require("../../model/productModel");
const Category = require("../../model/categoryModel");
const Order = require("../../model/orderModel");

const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();

const breadcrumbs = async (req, res) => {
  try {
    res.render("/", { breadcrumbs });
  } catch (error) {
    console.log(error);
  }
};

//load home page for user
const loadHome = async (req, res) => {
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

    const products = await Product.find({ isListed: "true" }).limit(6).sort({ _id: -1 });
    const categories = await Category.find({ isListed: "true" });

    res.render("home", {
      user,
      wishlistItems,
      cartItems,
      products,
      categories,
    });
  } catch (error) {
    console.error("Error rendering home:", error);
    res.status(500).send("Internal Server Error");
  }
};

//load contact page for user, if the user already login
const loadContact = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlistItems = await Wishlist.findOne({ userId }).populate("products.productId");
    const categories = await Category.find({ isListed: "true" });

    const cartItems = cart && cart.items ? cart.items : [];
    const wishlistItemsList = wishlistItems ? wishlistItems.products : [];

    res.render("contact-us", {
      user,
      cartItems,
      wishlistItems: wishlistItemsList,
      categories,
    });
  } catch (error) {
    console.error("Error loading contact page:", error);
    res.status(500).send("Server Error");
  }
};

//the contact page message send to the owner email
const sendMessage = async (req, res) => {
  try {
    const { cname, cemail, cphone, csubject, cmessage } = req.body;
    let transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    let mailOptions = {
      from: `"${cname}" <${cemail}>`,
      to: process.env.EMAIL_USER,
      subject: `New Contact Form Submission: ${csubject}`,
      text: `
        Name: ${cname}
        Email: ${cemail}
        Phone: ${cphone}
        Subject: ${csubject}
        Message: ${cmessage}
      `,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${cname}</p>
        <p><strong>Email:</strong> ${cemail}</p>
        <p><strong>Phone:</strong> ${cphone}</p>
        <p><strong>Subject:</strong> ${csubject}</p>
        <p><strong>Message:</strong> ${cmessage}</p>
      `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
        res.status(500).json({ success: false });
      } else {
        console.log("Message sent: %s", info.messageId);
        res.json({ success: true });
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false });
  }
};

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
    res.render("address", {
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

module.exports = {
  breadcrumbs,
  loadHome,
  loadContact,
  sendMessage,
  loadAddress,
};
