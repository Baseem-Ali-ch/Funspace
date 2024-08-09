const isUserAuthenticated = (req, res, next) => {
  try {
    if (req.session.user || req.user) {
      return next();
    } else {
      res.redirect("/login");
    }
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const isUserLogout = (req, res, next) => {
  try {
    if (req.session.user) {
      res.redirect("/home");
    } else {
      next();
    }
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const isUserWishlistPage = (req, res, next) => {
  try {
    if (req.session.user) {
      res.render("wishlist", { user: req.session.user });
      next()
    } else {
      res.redirect("/login");
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

const isUserContactPage = (req, res, next) => {
  try {
    if (req.session.user) {
      res.render("contact-us", { user: req.session.user });
      next()
    } else {
      res.redirect("/login");
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

module.exports = {
  isUserAuthenticated,
  isUserLogout,
  isUserWishlistPage,
  isUserContactPage,
};
