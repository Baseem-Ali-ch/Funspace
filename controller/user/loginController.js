const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const randomstring = require("randomstring");

const userModel = require("../../model/userModel");

const generateOTP = () => {
  return randomstring.generate({
    length: 6,
    charset: "numeric",
  });
};

const securePassword = async (password) => {
  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    return passwordHash;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendOTPEmail = (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "OTP Verification",
    html: `<p>OTP Verification from Furnspace website. Please verify your OTP and enjoy your shop.</p>
           <p>Your OTP for verification is: <strong>${otp}</strong></p>`,
    //text: `Your OTP for verification is: ${otp}`,
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
        reject(error);
      } else {
        console.log("Email sent: " + info.response);
        resolve(info.response);
      }
    });
  });
};

const setRedirectUrl = (req, res, next) => {
  if (!req.session.user && req.path !== "/login" && req.path !== "/register") {
    req.session.redirectUrl = req.originalUrl;
  }
  next();
};

const loadRegister = async (req, res) => {
  try {
    res.render("register", { message: null });
  } catch (error) {
    console.log(error);
  }
};

const loadVerifyOtp = async (req, res) => {
  try {
    const { email } = req.query;
    if (!otpStore[email]) {
      res.status(400).send("No OTP found for this email");
      return;
    }
    res.render("verifyOTP", {
      email,
      message: "Enter the OTP sent to your email.",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (otpStore[email] && otpStore[email].otp === otp) {
      const userData = new userModel({
        ...otpStore[email].userData,
        is_admin: false,
        is_verified: true,
      });

      const savedUser = await userData.save();
      delete otpStore[email];
      req.session.user = savedUser;
      res.json({ success: true, redirectUrl: `/home?email=${email}` });
    } else {
      res.json({ success: false, message: "Invalid OTP" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

const resentOTP = async (req, res) => {
  try {
    const { email } = req.query;
    if (!otpStore[email]) {
      res.status(400).send("No OTP found for this email");
      return;
    }

    const newOTP = generateOTP();
    otpStore[email].otp = newOTP;
    console.log("resend otp : ", newOTP);
    await sendOTPEmail(email, newOTP);

    res.status(200).send("OTP resent successfully.");
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to resend OTP.");
  }
};

const loadLogin = async (req, res) => {
  try {
    if (req.session.user) {
      const redirectUrl = req.session.redirectUrl || "/home";
      delete req.session.redirectUrl;
      return res.redirect(redirectUrl);
    }
    res.render("login");
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

let otpStore = {};

//insert the user data to database
const insertUser = async (req, res) => {
  try {
    const { name, phone, email, password, confirmPassword } = req.body;
    const user = await userModel.findOne({ email: email });
    if (user) {
      return res.render("register", { message: "The email is already exists. Please login and continue" });
    } else {
      const spassword = await securePassword(password);
      const otp = generateOTP();
      otpStore[email] = {
        otp,
        userData: { name, phone, email, password: spassword },
      };
      console.log("otp : ", otp), await sendOTPEmail(email, otp);
      res.redirect(`/verify-otp?email=${email}`);
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

const verifyLogin = async (req, res) => {
  try {
    const { "login-email": email, "login-password": password } = req.body;
    const userData = await userModel.findOne({ email });

    if (userData) {
      if (userData.isListed === "false") {
        return res.render("login", {
          message: "Your account has been blocked. Please Make another account.",
        });
      }

      const passwordMatch = await bcrypt.compare(password, userData.password);
      if (passwordMatch) {
        if (userData.is_verified) {
          req.session.user = userData; // Set user data in session
          const redirectUrl = req.session.redirectUrl || "/home";
          delete req.session.redirectUrl;
          return res.redirect(redirectUrl); 
        } else {
          return res.redirect("/register");
        }
      } else {
        return res.render("login", {
          message: "Email and Password is incorrect",
        });
      }
    } else {
      return res.render("login", {
        message: "Email and Password is incorrect",
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).send("Internal Server Error");
  }
};

const userLogout = async (req, res) => {
  try {
    req.session.destroy((error) => {
      if (error) {
        console.error("Failed to destroy session during logout", error);
        return res.redirect("/");
      }
      res.clearCookie("connect.sid");
      res.redirect("/");
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};


module.exports = {
  setRedirectUrl,
  loadRegister,
  loadVerifyOtp,
  verifyOTP,
  resentOTP,
  loadLogin,
  insertUser,
  verifyLogin,
  userLogout,
};
