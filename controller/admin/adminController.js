const userModel = require("../../model/userModel");
const Order = require("../../model/orderModel"); // Adjust the path as per your project structure
const bcrypt = require("bcrypt");
const moment = require("moment");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const fs = require("fs");

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
    let { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      // Default to last 30 days if no date range is specified
      startDate = moment().subtract(30, "days").format("YYYY-MM-DD");
      endDate = moment().format("YYYY-MM-DD");
    }

    // Parse the dates and set the time
    const startDateTime = moment(startDate).startOf("day");
    const endDateTime = moment(endDate).endOf("day");

    const orders = await Order.find({
      createdAt: { $gte: startDateTime.toDate(), $lte: endDateTime.toDate() },
    })
      .populate("user", "name email")
      .populate("items.product", "name price")
      .sort({ createdAt: -1 });

    let totalRevenue = 0;
    let totalQuantity = 0;
    let totalDiscount = 0;

    const salesData = orders.map((order) => {
      const orderTotal = order.totalPrice - order.couponDiscountAmt;
      totalRevenue += orderTotal;

      const orderQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
      totalQuantity += orderQuantity;

      totalDiscount += order.couponDiscountAmt;

      return {
        orderId: order._id,
        date: order.createdAt,
        user: order.user ? `${order.user.name} (${order.user.email})` : "Guest",
        items: order.items.map((item) => ({
          product: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
        })),
        totalQuantity: orderQuantity,
        total: orderTotal,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.payment_status,
        orderStatus: order.order_status,
        couponDisc: order.couponDiscountAmt,
        totalDiscount: totalDiscount
      };
    });

    res.render("dashboard", {
      isAdmin: req.session.admin,
      salesData,
      totalRevenue,
      totalQuantity,
      title: "Sales Report",
      startDate: startDateTime.format("YYYY-MM-DD"),
      endDate: endDateTime.format("YYYY-MM-DD"),
      moment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("error", { message: "Internal Server Error" });
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

    const orders = await Order.find().populate("items.product").populate("address").populate("user").skip(skip).limit(limit);
    const totalOrders = await Order.countDocuments();
    const totalPages = Math.ceil(totalOrders / limit);
    const isAdmin = req.session.admin;
    return res.render("order-list", {
      isAdmin,
      orders,
      currentPage: page,
      totalPages,
      userId,
    });
  } catch (error) {
    console.log(error);
  }
};

//update the order status
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, order_status } = req.body;

    const allowedStatuses = ["Pending", "Processing", "Shipped", "Deliverd", "Cancel"];
    if (!allowedStatuses.includes(order_status)) {
      return res.status(400).json({ success: false, message: "Invalid order status" });
    }

    const updatedOrder = await Order.findByIdAndUpdate(orderId, { order_status: order_status }, { new: true });

    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Redirect back to the order list or send a success response
    res.redirect("/admin/order-list");
    // return res.status(200).json({message:"status update successfully",message:true})
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ success: false, message: "Error updating order status" });
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
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const userData = await userModel.find().skip(skip).limit(limit);
    const totalUsers = await userModel.countDocuments();
    const totalPages = Math.ceil(totalUsers / limit);
    const isAdmin = req.session.admin;

    return res.render("all-customer", {
      customers: userData,
      isAdmin,
      currentPage: page,
      totalPages,
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
    const doc = new PDFDocument();
    let filename = "sales-report.pdf";

    res.setHeader("Content-disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-type", "application/pdf");

    doc.pipe(res);

    doc.fontSize(18).text("Sales Report", { align: "center" });
    doc.moveDown();

    salesData.forEach((order, index) => {
      doc.fontSize(12).text(`Order ${index + 1}`, { underline: true });
      doc.text(`Order ID: ${order._id}`);
      doc.text(`Customer: ${order.user ? order.user.name : "N/A"}`);
      doc.text(`Total Amount: $${order.totalPrice.toFixed(2)}`);
      doc.text(`Order Date: ${new Date(order.createdAt).toLocaleDateString()}`);
      doc.moveDown();
    });

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

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    worksheet.columns = [
      { header: "Order ID", key: "orderId", width: 15 },
      { header: "Date", key: "date", width: 15 },
      { header: "User", key: "user", width: 20 },
      { header: "Total Amount", key: "total", width: 15 },
      { header: "Payment Method", key: "paymentMethod", width: 20 },
      { header: "Payment Status", key: "paymentStatus", width: 20 },
      { header: "Order Status", key: "orderStatus", width: 20 },
    ];

    salesData.forEach((sale) => {
      worksheet.addRow({
        orderId: sale._id.toString(),
        date: new Date(sale.createdAt).toLocaleDateString(),
        user: sale.user ? sale.user.name : "N/A",
        total: sale.totalPrice.toFixed(2),
        paymentMethod: sale.paymentMethod,
        paymentStatus: sale.payment_status,
        orderStatus: sale.order_status,
      });
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
};
