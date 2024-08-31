const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const bodyParser = require("body-parser");

const MongoStore = require("connect-mongo");
const passport = require("./config/passport");
const mongoose = require("mongoose");

// Connect to MongoDB with the FurnSpace db name
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((error) => {
    console.log(error);
  });

const app = express();


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const userStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  collectionName: "user_sessions",
});

const adminStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  collectionName: "admin_sessions",
});

app.use(
  session({
    secret: process.env.USER_SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: userStore,
    cookie: { secure: false },
  }),
);

app.use(
  "/admin",
  session({
    secret: process.env.ADMIN_SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: adminStore,
    cookie: { secure: false },
  }),
);

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Serialize and deserialize user
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Serve static files
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/dashboard-assets", express.static(path.join(__dirname, "dashboard-assets")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/admin", passport.initialize());
app.use("/admin", passport.session());

// user routes
const userRoute = require("./routes/userRoute");
app.use("/", userRoute);

//admin routes
const adminRoute = require("./routes/adminRoute");
app.use("/admin", adminRoute);

//auth routes
const authRoute = require("./routes/authRoutes");
app.use("/", authRoute);

// Render index page
app.get("/", (req, res) => {
  res.render("index", { user: req.user });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});
