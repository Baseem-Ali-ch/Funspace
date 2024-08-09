//controllers
const loginController = require("../controller/user/loginController");
const userController = require("../controller/user/userController");
const accountController = require("../controller/user/accountController");
const productController = require("../controller/user/productController");
const orderController = require("../controller/user/orderController");
const couponController = require('../controller/admin/couponController')
const breadcrumbs = require("../middleware/breadcrumbs");
const auth = require("../middleware/userAuth");

const Order = require('../model/orderModel')

const express = require("express");
const userRoute = express();
const nocache = require("nocache");

// Set view engine and views directory
userRoute.set("view engine", "ejs");
userRoute.set("views", "./views/user");

userRoute.use(nocache());
userRoute.use(breadcrumbs);

//main user route
userRoute.get("/", userController.loadHome);
userRoute.get("/home", userController.loadHome);
userRoute.get("/product/:id", productController.loadProduct);
userRoute.get("/product-list", productController.loadProductList);
userRoute.post("/filter-and-sort-products", productController.filterAndSortProducts);

//cart routes
userRoute.get("/cart", productController.loadCart);
userRoute.post("/cart", productController.addToCart);
userRoute.patch("/cart/:productId", productController.updateCartItemQty);
userRoute.delete("/cart/:productId", auth.isUserAuthenticated, productController.removeFromCart);

// wishlist routes
userRoute.get("/wishlist", auth.isUserAuthenticated, productController.loadWishlist);
userRoute.post("/wishlist", auth.isUserAuthenticated, productController.addToWishlist);
userRoute.delete("/wishlist/:productId", auth.isUserAuthenticated, productController.removeFromWishlist);

//checkout and order routes
userRoute.get("/checkout", auth.isUserAuthenticated, orderController.loadCheckout);
userRoute.post("/checkout", auth.isUserAuthenticated, orderController.placeOrder);
userRoute.get("/checkout/ordered/:orderId", auth.isUserAuthenticated, orderController.orderConfirm);
userRoute.post("/account/order-status", auth.isUserAuthenticated, orderController.updateStatus);
userRoute.post("/checkout/verify-payment", auth.isUserAuthenticated, orderController.verifyPayment);

userRoute.get('/order-success', (req, res) => {
    const { orderId } = req.query;
    if (!orderId) {
      return res.status(400).send("Order ID is required");
    }
  
    Order.findById(orderId, (err, order) => {
      if (err || !order) {
        return res.status(404).send("Order not found");
      }
  
      res.render('order-success', { order });
    });
  });
  

//account route
userRoute.get("/address", auth.isUserAuthenticated, userController.loadAddress);


//contact routes
userRoute.get("/contact-us", auth.isUserAuthenticated, userController.loadContact);
userRoute.post("/contact-us", auth.isUserAuthenticated, userController.sendMessage);

//register and login route. login controller
userRoute.get("/register", auth.isUserLogout, loginController.loadRegister);
userRoute.post("/register", auth.isUserLogout, loginController.insertUser);
userRoute.get("/verify-otp", loginController.loadVerifyOtp);
userRoute.post("/verify-otp", loginController.verifyOTP);
userRoute.get("/resend-otp", loginController.resentOTP);
userRoute.get("/login", auth.isUserLogout, loginController.loadLogin);
userRoute.post("/login", auth.isUserLogout, loginController.verifyLogin);
userRoute.get("/logout", auth.isUserAuthenticated, loginController.userLogout);

//account manage. account controller
// userRoute.get("/profile", auth.isUserAuthenticated, accountController.loadProfile
userRoute.get("/account", auth.isUserAuthenticated, accountController.loadProfile);
userRoute.post("/account", auth.isUserAuthenticated, accountController.updateProfile);
userRoute.get("/forget-password", accountController.forgetPassword);
userRoute.post("/forget-password", accountController.verifyForgetPassword);
userRoute.get("/reset-password", accountController.resetPasswordPage);
userRoute.post("/reset-password", accountController.resetPassword);
userRoute.get('/change-password', auth.isUserAuthenticated, accountController.changePassword);
userRoute.post('/change-password', auth.isUserAuthenticated, accountController.changedPassword);


//manage checkout address, order, dashboard
userRoute.post("/account/address", accountController.addAddress);
userRoute.get("/account/address", accountController.loadAddress);
userRoute.get("/account/addresses", accountController.getAddress);
userRoute.patch("/account/address/update/:id", accountController.updateAddress);
userRoute.delete("/account/address/:id", accountController.deleteAddress);

//coupon
userRoute.post('/apply-coupon',couponController.applyCoupon)


//wallet
userRoute.get('/wallet',auth.isUserAuthenticated,accountController.loadWallet )
userRoute.patch('/update-order-status', accountController.updateOrderStatus);

// Authentication Routes
const authRoute = require("./authRoutes"); // Ensure this path is correct
userRoute.use("/", authRoute);

module.exports = userRoute;
