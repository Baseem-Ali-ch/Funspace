const isAdminAuthenticated = (req, res, next) => {
  try {
    if (req.session.admin) {
      return next();
    } else {
      res.redirect("/admin/login"); // Redirect to admin login page if not authenticated
    }
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const isAdminLogout = (req, res, next) => {
  try {
    if (req.session.admin) {
      res.redirect("/admin/dashboard");
    } else {
      next();
    }
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const isAdminPage = (req, res, next) => {
  try {
    if (req.session.admin) {
      res.render("admin-dashboard", { admin: req.session.admin });
    } else {
      res.redirect("/admin/login");
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

module.exports = {
  isAdminAuthenticated,
  isAdminLogout,
  isAdminPage,
};
