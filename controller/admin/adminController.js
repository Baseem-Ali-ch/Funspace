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
    console.log("Query Params:", { startDate, endDate, filterPeriod });

    const now = moment();
    let defaultStart = now.clone().subtract(30, "days").startOf("day");
    let defaultEnd = now.clone().endOf("day");

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
          startDate = moment(startDate).startOf("day");
          endDate =  moment(endDate).endOf("day");

          break;
      }
    } else {
      // Default to last 30 days if no date range or filter period is specified
      if (!startDate || !endDate) {
        startDate = defaultStart.format("YYYY-MM-DD");
        endDate = defaultEnd.format("YYYY-MM-DD");
      }
    }

    // Parse the dates and set the time
    const startDateTime = moment(startDate).startOf("day");
    const endDateTime = moment(endDate).endOf("day");

    // Debugging logs
    console.log('Parsed Start Date:', startDateTime.toDate());
    console.log('Parsed End Date:', endDateTime.toDate());

    // Fetch orders based on the date range
    const orders = await Order.find({
      createdAt: { $gte: startDateTime.toDate(), $lte: endDateTime.toDate() },
    })
      .populate("user", "name email")
      .populate("items.product", "name price category")
      .sort({ createdAt: -1 });

    console.log('Fetched Orders:', orders);

    // Extract product IDs and category IDs to fetch offers
    const productIds = orders.flatMap((order) => 
      order.items.filter((item) => item.product && item.product._id).map((item) => item.product._id)
    );
    const categoryIds = orders.flatMap((order) => 
      order.items.filter((item) => item.product && item.product.category).map((item) => item.product.category)
    );

    console.log('Product IDs:', productIds);
    console.log('Category IDs:', categoryIds);

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
      headers: ["Order ID", "Customer", "Total Amount","discoutn", "Order Date"],
      rows: [],
    };

    let grandTotal = 0;
    let grandDiscount = 0;

    // Populate table rows and calculate the grand total
    salesData.forEach((order) => {
      
      const total = order.totalPrice.toFixed(2);
      const discount = parseFloat(order.couponDiscountAmt.toFixed(2) || 0); 
      grandTotal += parseFloat(total);
      //grandDiscount += discount;

      table.rows.push([
        order.orderId,
        order.user ? order.user.name : "N/A",
        `₹${total}`,
        //`₹${discount.toFixed(2)}`,
        new Date(order.createdAt).toLocaleDateString(),
      ]);
    });

    // Draw table headers
    const startX = 50;
    const startY = 150;
    const rowHeight = 30;
    const colWidth = (doc.page.width - 2 * startX) / table.headers.length;

    // Draw headers with styling
    doc.font("Helvetica-Bold").fontSize(12).fillColor('white');
    doc.rect(startX, startY, colWidth * table.headers.length, rowHeight).fill('#4A4A4A');
    doc.fillColor('black');
    table.headers.forEach((header, i) => {
      doc.text(header, startX + i * colWidth, startY + 10, {
        width: colWidth,
        align: "center",
      });
    });

    // Draw rows with styling
    let currentY = startY + rowHeight; // Position after headers

    doc.font("Helvetica").fontSize(10).fillColor('black');
    table.rows.forEach((row) => {
      row.forEach((cell, colIndex) => {
        doc.text(cell, startX + colIndex * colWidth, currentY + 5, {
          width: colWidth,
          align: "center",
        });
      });
      currentY += rowHeight; // Move down to the next row
    });

    // Draw lines (for table borders)
    doc.lineWidth(0.5);

    // Vertical lines
    for (let i = 0; i <= table.headers.length; i++) {
      doc.moveTo(startX + i * colWidth, startY)
        .lineTo(startX + i * colWidth, currentY)
        .stroke();
    }

    // Horizontal lines
    for (let i = 0; i <= table.rows.length; i++) {
      doc.moveTo(startX, startY + i * rowHeight)
        .lineTo(startX + table.headers.length * colWidth, startY + i * rowHeight)
        .stroke();
    }

    // Draw bottom line for header
    doc.moveTo(startX, startY).lineTo(startX + table.headers.length * colWidth, startY).stroke();

    // Grand total
    const grandTotalY = currentY + 10;
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

module.exports = {
  loadLogin,
  verifyLogin,
  loadHome,
  loadAllUser,
  updateCustomer,
  adminLogout,
  loadAdmProfile,
  generatePdf,
  salesReportPdf,
  salesReportExcel,
};
