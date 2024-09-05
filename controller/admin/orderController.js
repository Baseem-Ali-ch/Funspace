const userModel = require("../../model/userModel");
const Order = require("../../model/orderModel");
const bcrypt = require("bcrypt");
const moment = require("moment");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const fs = require("fs");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;
const Category = require("../../model/categoryModel");
const Product = require("../../model/productModel");
const Offer = require("../../model/offerModel");

const loadOrderList = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    const userId = user ? user._id : null;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const searchQuery = search
      ? {
          $or: [{ orderId: new RegExp(search, "i") }, { "user.name": new RegExp(search, "i") }, ...(ObjectId.isValid(search) ? [{ _id: search }] : [])],
        }
      : {};

    const orders = await Order.find(searchQuery).populate("items.product").populate("address").populate("user").sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

    for (let order of orders) {
      let totalPrice = 0;

      for (let item of order.items) {
        let finalPrice = item?.product?.price;
        let offerDetails = null;

        if (item.product) {
          // Check for product-specific offers
          const productOffers = await Offer.find({
            offerType: "product",
            status: "active",
            _id: { $in: item.product.offerIds || [] },
          }).exec();

          // Check for category-specific offers
          const categoryOffers = await Offer.find({
            offerType: "category",
            status: "active",
            categoryIds: item.product.category,
          }).exec();

          let bestOffer = null;

          // Determine the best product offer
          if (productOffers.length > 0) {
            bestOffer = productOffers.reduce((max, offer) => (offer.discount > max.discount ? offer : max), productOffers[0]);
          }

          // Determine the best category offer
          if (categoryOffers.length > 0) {
            const categoryBestOffer = categoryOffers.reduce((max, offer) => (offer.discount > max.discount ? offer : max), categoryOffers[0]);
            if (!bestOffer || categoryBestOffer.discount > bestOffer.discount) {
              bestOffer = categoryBestOffer;
            }
          }

          // Apply the best offer to the product
          if (bestOffer) {
            finalPrice = item.product.price * (1 - bestOffer.discount / 100);
            offerDetails = {
              offerType: bestOffer.offerType,
              discount: bestOffer.discount,
              offerName: bestOffer.offerName,
              description: bestOffer.description || "No additional details available",
            };
          }

          // Calculate the total price
          totalPrice += finalPrice * item.quantity;
          item.product.finalPrice = finalPrice.toFixed(2);
          item.product.offerDetails = offerDetails;
        }
      }

      order.totalPrice = totalPrice.toFixed(2);
    }

    const totalOrders = await Order.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalOrders / limit);
    const isAdmin = req.session.admin;

    return res.render("order-list", {
      isAdmin,
      orders,
      currentPage: page,
      totalPages,
      userId,
      search,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send("Server Error");
  }
};

const updateOrderStatus = async (req, res) => {
  console.log("Updating order status");

  try {
    const { orderId, productId, product_status } = req.body;
    console.log("Order ID:", orderId);
    console.log("Product ID:", productId);
    console.log("New Status:", product_status);

    const allowedStatuses = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Returned"];
    if (!allowedStatuses.includes(product_status)) {
      return res.status(400).json({ success: false, message: "Invalid order status" });
    }

    const updatedOrder = await Order.findOneAndUpdate({ _id: orderId, "items._id": productId }, { $set: { "items.$.order_status": product_status } }, { new: true });

    if (!updatedOrder) {
      console.error("Order or product not found");
      return res.status(404).json({ success: false, message: "Order or product not found" });
    }

    console.log("Updated Order:", updatedOrder);
    return res.status(200).json({ success: true, message: "Status updated successfully" });
  } catch (error) {
    console.error("Error updating order status:", error);
    return res.status(500).json({ success: false, message: "Error updating order status" });
  }
};

const loadOrderDeatails = async (req, res) => {
  try {
    const isAdmin = req.session.admin;
    return res.render("order-details", { isAdmin });
  } catch (error) {
    console.log(error);
  }
};

const acceptReturn = async (req, res) => {
  try {
    const { orderId, itemId, item_status } = req.body;

    const order = await Order.findOne({ _id: orderId });
    if (!order) {
      return res.status(400).json({ success: false, message: "Order not found" });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(400).json({ success: false, message: "Item not found" });
    }

    if (item.order_status === "Return Requested" && item_status === "Returned") {
      item.order_status = "Returned";
    } else if (item.order_status === "Return Requested" && item_status === "Delivered") {
      item.order_status = "Delivered"; // Rejecting the return request
    }

    await order.save();
    res.redirect("/admin/order-list?status=updated");
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ success: false, message: "Failed to update order status" });
  }
};

// Reject return request
const rejectReturn = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).send("Order not found");
    }

    order.returnRequestStatus = "Rejected";
    order.items.forEach((item) => {
      if (item.order_status === "Return Requested") {
        item.order_status = "Delivered"; // Assuming the return is rejected, reset to Delivered
      }
    });

    await order.save();
    res.redirect("/admin/order-list");
  } catch (error) {
    console.error("Error rejecting return request:", error);
    res.status(500).send("Failed to reject return request");
  }
};

module.exports = {
  loadOrderList,
  loadOrderDeatails,
  updateOrderStatus,
  acceptReturn,
  rejectReturn,
};
