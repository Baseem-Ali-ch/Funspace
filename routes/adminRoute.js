const productController = require("../controller/admin/productController");
const adminController = require("../controller/admin/adminController");
const upload = require("../middleware/multer");
const { isAdminAuthenticated } = require("../middleware/adminAuth");
const adminBreadcrumbs = require("../middleware/adminBreadcrumbs");
const couponController = require("../controller/admin/couponController");
const orderController = require("../controller/admin/orderController");
const offerController = require("../controller/admin/offerController");

const nocache = require("nocache");
const express = require("express");
const adminRoute = express();

adminRoute.use(nocache());
adminRoute.use(adminBreadcrumbs);

//ejs view engine
adminRoute.set("view engine", "ejs");
adminRoute.set("views", "./views/admin");

// login Routes
adminRoute.get("/", adminController.loadLogin);
adminRoute.post("/", adminController.verifyLogin);

//home routes
adminRoute.get("/dashboard", isAdminAuthenticated, adminController.loadHome);

//product management
adminRoute.get("/product-list", isAdminAuthenticated, productController.loadProductList);
adminRoute.get("/add-product", isAdminAuthenticated, productController.loadAddProduct);
adminRoute.post("/add-product", isAdminAuthenticated, productController.addProduct);

// Route for updating a product
adminRoute.patch("/admin/update-product/:id", isAdminAuthenticated, productController.updateProduct);

//category management
adminRoute.get("/category-list", isAdminAuthenticated, productController.loadCategoryList);
adminRoute.post("/categories/add", isAdminAuthenticated, productController.addCategory);
adminRoute.patch("/category-list/:id", isAdminAuthenticated, productController.updateCategory);

//order management
adminRoute.get("/order-list", isAdminAuthenticated, orderController.loadOrderList);
adminRoute.post("/order-list/update-order-status", isAdminAuthenticated, orderController.updateOrderStatus);
adminRoute.get("/order-details", isAdminAuthenticated, orderController.loadOrderDeatails);
adminRoute.post("/order-list/handle-return", isAdminAuthenticated, orderController.acceptReturn);
adminRoute.get("/order-list/reject-return/:orderId", isAdminAuthenticated, orderController.rejectReturn);

//user management
adminRoute.get("/allCustomer", isAdminAuthenticated, adminController.loadAllUser);
adminRoute.patch("/allCustomer/:id", isAdminAuthenticated, adminController.updateCustomer);

//admin profile
adminRoute.get("/admin-profile", isAdminAuthenticated, adminController.loadAdmProfile);
adminRoute.post("/logout", isAdminAuthenticated, adminController.adminLogout);

//coupon management. add, edit, delete a coupon
adminRoute.get("/list-coupon", couponController.getCoupons);
adminRoute.get("/add-coupon", couponController.newCouponForm);
adminRoute.post("/add-coupon", couponController.createCoupon);
adminRoute.get("/get-coupon/:id", couponController.getCoupon);
adminRoute.put("/edit-coupon/:id", couponController.updateCoupon);
adminRoute.post("/coupons/:id/delete", couponController.deleteCoupon);

//sales report
// adminRoute.get("/sales-report", productController.salesReport);

//download reports
adminRoute.get("/sales-report/:type", isAdminAuthenticated, adminController.salesReportPdf);
adminRoute.get("/sales-report/:type", isAdminAuthenticated, adminController.salesReportExcel);

//offer
adminRoute.get("/add-offer", offerController.renderAddOfferPage);
adminRoute.get("/offer-list", offerController.offerList);
adminRoute.post("/add-offer", offerController.addOffer);
adminRoute.put("/offer-list", offerController.editOffer);
adminRoute.delete("/add-offer/delete/:offerId", offerController.deleteOffer);

// adminRoute.use((req, res, next) => {
//   res.status(404).render('404admin'); // Renders the 404 view
// });

// Catch-all route for undefined paths
adminRoute.get("*", (req, res) => {
  res.redirect("/admin");
});

module.exports = adminRoute;
