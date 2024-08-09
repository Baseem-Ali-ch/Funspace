const express = require("express");
const passport = require("passport");
const { loadHome } = require("../controller/admin/adminController");

const router = express.Router();

router.use(passport.initialize());
router.use(passport.session());

//google auth
router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/auth/google/callback", 
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    req.session.userId = req.user._id;
    res.redirect("/home");
  }
);

//facebook auth
router.get("/auth/facebook", passport.authenticate("facebook", { scope: ["email"] }));
router.get("/auth/facebook/callback", passport.authenticate("facebook", { failureRedirect: "/login" }), (req, res) => {
  req.session.userId = req.user._id;
  res.redirect("/");
});

router.get("/api/logout", (req, res) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

router.get("/api/current_user", (req, res) => {
  res.send(req.user);
});

router.get("/", (req, res) => {
  const user = req.user;
  res.render("index", { user });
});

router.get("/home", loadHome);

module.exports = router;
