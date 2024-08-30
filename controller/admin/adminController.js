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

//load login page for admin
const loadLogin = async (req, res) => {
  try {
    return res.render("login");
  } catch (error) {
    console.log(error);
    return res.status(500).send("Internal Server Error");
  }
};

//verify admin login
const verifyLogin = async (req, res) => {
  try {
    const { "login-email": email, "login-password": password } = req.body;
    const userData = await userModel.findOne({ email });
    if (userData) {
      const passwordMatch = await bcrypt.compare(password, userData.password);
      if (passwordMatch) {
        if (userData.is_admin) {
          req.session.admin = userData;

          return res.redirect("/admin/dashboard");
        } else {
          return res.render("login", {
            message: "Email and Password are incorrect or you are not authorized as admin.",
          });
        }
      } else {
        return res.render("login", {
          message: "Email and Password are incorrect or you are not authorized as admin.",
        });
      }
    } else {
      return res.render("login", {
        message: "Email and Password are incorrect or you are not authorized as admin.",
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).send("Internal Server Error");
  }
};

//load admin dashboard
const loadHome = async (req, res) => {
  try {
    let { startDate, endDate, filterPeriod } = req.query;

    // Handle filter periods
    if (filterPeriod) {
      switch (filterPeriod) {
        case "today":
          startDate = moment().startOf("day").format("YYYY-MM-DD");
          endDate = moment().endOf("day").format("YYYY-MM-DD");
          break;
        case "yesterday":
          startDate = moment().subtract(1, "days").startOf("day").format("YYYY-MM-DD");
          endDate = moment().subtract(1, "days").endOf("day").format("YYYY-MM-DD");
          break;
        case "week":
          startDate = moment().startOf("week").format("YYYY-MM-DD");
          endDate = moment().endOf("week").format("YYYY-MM-DD");
          break;
        case "month":
          startDate = moment().startOf("month").format("YYYY-MM-DD");
          endDate = moment().endOf("month").format("YYYY-MM-DD");
          break;
        case "year":
          startDate = moment().startOf("year").format("YYYY-MM-DD");
          endDate = moment().endOf("year").format("YYYY-MM-DD");
          break;
        default:
          startDate = moment().subtract(30, "days").format("YYYY-MM-DD");
          endDate = moment().format("YYYY-MM-DD");
          break;
      }
    } else {
      // Default to last 30 days if no date range or filter period is specified
      if (!startDate || !endDate) {
        startDate = moment().subtract(30, "days").format("YYYY-MM-DD");
        endDate = moment().format("YYYY-MM-DD");
      }
    }

    // Parse the dates and set the time
    const startDateTime = moment(startDate).startOf("day");
    const endDateTime = moment(endDate).endOf("day");

    // Fetch orders based on the date range
    const orders = await Order.find({
      createdAt: { $gte: startDateTime.toDate(), $lte: endDateTime.toDate() },
    })
      .populate("user", "name email")
      .populate("items.product", "name price category")
      .sort({ createdAt: -1 });

    // Extract product IDs and category IDs to fetch offers
    const productIds = orders.flatMap((order) => order.items.filter((item) => item.product && item.product._id).map((item) => item.product._id));
    const categoryIds = orders.flatMap((order) => order.items.filter((item) => item.product && item.product.category).map((item) => item.product.category));

    // Fetch offers related to products and categories
    const productOffers = await Offer.find({
      offerType: "product",
      productIds: { $in: productIds },
      status: "active",
    });

    const categoryOffers = await Offer.find({
      offerType: "category",
      categoryIds: { $in: categoryIds },
      status: "active",
    });

    // Prepare offer lookup
    const offerLookup = {};
    productOffers.forEach((offer) => {
      offer.productIds.forEach((productId) => {
        offerLookup[productId.toString()] = offer;
      });
    });

    categoryOffers.forEach((offer) => {
      offer.categoryIds.forEach((categoryId) => {
        offerLookup[categoryId.toString()] = offer;
      });
    });

    let totalRevenue = 0;
    let totalQuantity = 0;
    let totalCouponDiscount = 0;
    let totalOfferDiscount = 0;

    const productSales = {};
    const categorySales = {};

    const salesData = orders.map((order) => {
      const originalTotalPrice = order.items.reduce((sum, item) => {
        return item.product ? sum + item.product.price * item.quantity : sum;
      }, 0);
      const offerDiscountAmt = order.items.reduce((sum, item) => {
        if (!item.product) return sum;
        const offer = offerLookup[item.product._id.toString()] || offerLookup[item.product.category.toString()];
        return sum + (offer ? (item.product.price * item.quantity * offer.discount) / 100 : 0);
      }, 0);

      const orderTotal = originalTotalPrice - order.couponDiscountAmt - offerDiscountAmt;
      totalRevenue += orderTotal;

      const orderQuantity = order.items.reduce((sum, item) => {
        if (!item.product) return sum;

        // Track product sales
        const productId = item.product._id.toString();
        if (!productSales[productId]) {
          productSales[productId] = { name: item.product.name, quantity: 0, category: item.product.category };
        }
        productSales[productId].quantity += item.quantity;

        // Track category sales
        const categoryId = item.product.category.toString();
        if (!categorySales[categoryId]) {
          categorySales[categoryId] = { quantity: 0 };
        }
        categorySales[categoryId].quantity += item.quantity;

        return sum + item.quantity;
      }, 0);
      totalQuantity += orderQuantity;

      totalCouponDiscount += order.couponDiscountAmt;
      totalOfferDiscount += offerDiscountAmt;

      return {
        orderId: order.orderId,
        date: order.createdAt,
        user: order.user ? `${order.user.name} (${order.user.email})` : "Guest",
        items: order.items
          .map((item) => {
            if (!item.product) return null;
            const offer = offerLookup[item.product._id.toString()] || offerLookup[item.product.category.toString()];
            return {
              product: item.product.name,
              quantity: item.quantity,
              price: item.product.price,
              offerDetails: offer
                ? {
                    offerName: offer.offerName,
                    discount: offer.discount,
                    description: offer.description,
                  }
                : null,
              order_status: item.order_status,
            };
          })
          .filter(Boolean),
        totalQuantity: orderQuantity,
        originalPrice: originalTotalPrice,
        total: originalTotalPrice - order.couponDiscountAmt - offerDiscountAmt,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.payment_status,
        orderStatus: order.order_status,
        couponDisc: order.couponDiscountAmt,
        offerDisc: offerDiscountAmt,
        grandTotal: orderTotal,
      };
    });

    // Determine the best-selling product
    const bestSellingProductId = Object.keys(productSales).reduce((a, b) => (productSales[a].quantity > productSales[b].quantity ? a : b), Object.keys(productSales)[0]);
    const bestSellingProduct = productSales[bestSellingProductId];

    const bestSellingCategoryId = Object.keys(categorySales).reduce((a, b) => (categorySales[a].quantity > categorySales[b].quantity ? a : b), Object.keys(categorySales)[0]);
    const bestSellingCategory = await Category.findById(bestSellingCategoryId);

    const totalDiscount = totalCouponDiscount + totalOfferDiscount;
    const totalProfit = totalRevenue - totalDiscount;

    res.render("dashboard", {
      isAdmin: req.session.admin,
      salesData,
      totalRevenue,
      totalQuantity,
      totalCouponDiscount,
      totalOfferDiscount,
      bestSellingProduct,
      bestSellingCategory,
      categorySales,
      totalProfit,
      totalDiscount,
      title: "Sales Report",
      startDate: startDateTime.format("YYYY-MM-DD"),
      endDate: endDateTime.format("YYYY-MM-DD"),
      moment,
      filterPeriod,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("admin/error", { message: "Internal Server Error" });
  }
};

//load order list in admin side
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

//update the order status
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

//load order details in admin side
const loadOrderDeatails = async (req, res) => {
  try {
    const isAdmin = req.session.admin;
    return res.render("order-details", { isAdmin });
  } catch (error) {
    console.log(error);
  }
};

//load all user list in admin side
const loadAllUser = async (req, res) => {
  const { search = "", page = 1 } = req.query;
  const limit = 10;
  const skip = (page - 1) * limit;

  try {
    // Build search query
    const searchQuery = search ? { $or: [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }] } : {};

    // Fetch users with pagination and search filter
    const userData = await userModel.find(searchQuery).skip(skip).limit(limit);
    const totalUsers = await userModel.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalUsers / limit);
    const isAdmin = req.session.admin;

    return res.render("all-customer", {
      customers: userData,
      isAdmin,
      currentPage: parseInt(page),
      totalPages,
      search,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send("Internal Server Error");
  }
};

//admin edit user details
const updateCustomer = async (req, res) => {
  const customerId = req.params.id;
  const { name, email, phone, isListed } = req.body;

  try {
    const updatedCustomer = await userModel.findByIdAndUpdate(customerId, { name, email, phone, isListed }, { new: true, runValidators: true });

    if (!updatedCustomer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    res.json({ success: true, message: "Customer updated successfully", data: updatedCustomer });
  } catch (error) {
    console.error("Error updating customer:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

//admin logout
const adminLogout = async (req, res) => {
  try {
    req.session.destroy((error) => {
      if (error) {
        console.error("Failed to destroy session during logout", error);
        return res.redirect("/admin");
      }
      res.clearCookie("connect.sid");
      res.redirect("/admin");
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

//load admin profile
const loadAdmProfile = async (req, res) => {
  try {
    const isAdmin = req.session.admin;
    res.render("admin-profile", { isAdmin });
  } catch (error) {
    console.log(error);
  }
};

//download report pdf

const generatePdf = (salesData, res) => {
  try {
    const doc = new PDFDocument({ margin: 50 });
    let filename = "sales-report.pdf";

    res.setHeader("Content-disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-type", "application/pdf");

    doc.pipe(res);

    // Title
    doc.fontSize(18).text("Sales Report", { align: "center", underline: true });
    doc.moveDown(2);

    // Define table
    const table = {
      headers: ["Order ID", "Customer", "Total Amount", "Order Date"],
      rows: [],
    };

    let grandTotal = 0;

    // Populate table rows and calculate the grand total
    salesData.forEach((order) => {
      const total = order.totalPrice.toFixed(2);
      grandTotal += parseFloat(total);

      table.rows.push([
        order.orderId,
        order.user ? order.user.name : "N/A",
        `₹${total}`,
        new Date(order.createdAt).toLocaleDateString(),
      ]);
    });

    // Draw table
    const startX = 50;
    const startY = 150;
    const rowHeight = 30;
    const colWidth = (doc.page.width - 2 * startX) / table.headers.length;

    // Draw headers with styling
    doc.font("Helvetica-Bold").fontSize(12).fillColor('white').rect(startX, startY - 20, colWidth * table.headers.length, rowHeight).fill('#4A4A4A').fillColor('black');
    table.headers.forEach((header, i) => {
      doc.text(header, startX + i * colWidth, startY - 10, {
        width: colWidth,
        align: "center",
      });
    });

    // Draw rows with styling
    doc.font("Helvetica").fontSize(10).fillColor('black');
    table.rows.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        doc.text(cell, startX + colIndex * colWidth, startY + rowIndex * rowHeight, {
          width: colWidth,
          align: "center",
        });
      });
    });

    // Draw lines (for table borders)
    doc.lineWidth(0.5);

    // Vertical lines
    for (let i = 0; i <= table.headers.length; i++) {
      doc.moveTo(startX + i * colWidth, startY - 20)
         .lineTo(startX + i * colWidth, startY + table.rows.length * rowHeight)
         .stroke();
    }

    // Horizontal lines
    for (let i = 0; i <= table.rows.length; i++) {
      doc.moveTo(startX, startY + i * rowHeight - 20)
         .lineTo(startX + table.headers.length * colWidth, startY + i * rowHeight - 20)
         .stroke();
    }

    // Grand total
    const grandTotalY = startY + table.rows.length * rowHeight + 10;
    doc.moveTo(startX, grandTotalY).lineTo(startX + table.headers.length * colWidth, grandTotalY).stroke();
    doc.font("Helvetica-Bold").fontSize(12).text(`Grand Total: ₹${grandTotal.toFixed(2)}`, startX + colWidth * 2, grandTotalY + 10, { align: "center" });

    doc.end();
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).send(`Error generating PDF: ${error.message}`);
  }
};



const salesReportPdf = async (req, res) => {
  try {
    const { startDate: startDateStr, endDate: endDateStr } = req.query;

    // Validate and parse dates
    if (!startDateStr || !endDateStr) {
      return res.status(400).send("Start Date and End Date are required.");
    }

    const startDate = new Date(`${startDateStr}T00:00:00`);
    const endDate = new Date(`${endDateStr}T23:59:59`);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).send("Invalid date format. Please use valid dates.");
    }

    const salesData = await Order.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .populate("user", "name")
      .lean();

    if (!salesData.length) {
      return res.status(404).send("No sales data found for the given date range.");
    }

    generatePdf(salesData, res);
  } catch (error) {
    console.error("Error fetching sales data:", error);
    res.status(500).send("Internal Server Error");
  }
};

const salesReportExcel = async (req, res) => {
  try {
    const { startDate: startDateStr, endDate: endDateStr } = req.query;

    // Validate and parse dates
    if (!startDateStr || !endDateStr) {
      return res.status(400).send("Start Date and End Date are required.");
    }

    const startDate = new Date(`${startDateStr}T00:00:00`);
    const endDate = new Date(`${endDateStr}T23:59:59`);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).send("Invalid date format. Please use valid dates.");
    }

    const salesData = await Order.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .populate("user", "name")
      .lean();

    if (!salesData.length) {
      return res.status(404).send("No sales data found for the given date range.");
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    worksheet.columns = [
      { header: "Order ID", key: "orderId", width: 20 },
      { header: "Date", key: "date", width: 15 },
      { header: "User", key: "user", width: 25 },
      { header: "Total Amount", key: "total", width: 15 },
      { header: "Payment Method", key: "paymentMethod", width: 20 },
      { header: "Payment Status", key: "paymentStatus", width: 20 },
      { header: "Order Status", key: "orderStatus", width: 20 },
    ];

    let grandTotal = 0;

    salesData.forEach((sale) => {
      grandTotal += parseFloat(sale.totalPrice);
      worksheet.addRow({
        orderId: sale._id.toString(),
        date: new Date(sale.createdAt).toLocaleDateString(),
        user: sale.user ? sale.user.name : "N/A",
        total: `₹${sale.totalPrice.toFixed(2)}`,
        paymentMethod: sale.paymentMethod,
        paymentStatus: sale.payment_status,
        orderStatus: sale.order_status,
      });
    });

    // Add Grand Total row
    worksheet.addRow({});
    const totalRow = worksheet.addRow({
      orderId: 'Grand Total',
      total: `₹${grandTotal.toFixed(2)}`,
    });
    totalRow.font = { bold: true };

    // Adjust column widths and styles
    worksheet.columns.forEach((column) => {
      column.alignment = { vertical: "middle", horizontal: "center" };
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=sales-report.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating Excel:", error);
    res.status(500).send(`Error generating Excel: ${error.message}`);
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
  loadLogin,
  verifyLogin,
  loadHome,
  loadOrderList,
  loadOrderDeatails,
  loadAllUser,
  updateCustomer,
  adminLogout,
  loadAdmProfile,
  updateOrderStatus,
  generatePdf,
  salesReportPdf,
  salesReportExcel,
  acceptReturn,
  rejectReturn,
};
