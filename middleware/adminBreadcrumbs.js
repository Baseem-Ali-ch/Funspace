// middleware/breadcrumbs.js

const express = require("express");
const breadcrumbs = express.Router();

breadcrumbs.use((req, res, next) => {
  const pathArray = req.path.split("/").filter((segment) => segment !== "");
  const breadcrumbArray = []; // Initialize empty array

  // Start with Dashboard link for admin side
  breadcrumbArray.push({ name: "Dashboard", url: "/admin/dashboard" });

  let path = "/admin/dashboard";

  pathArray.forEach((segment) => {
    path += `/${segment}`;
    
    // Replace common admin paths for clearer breadcrumbs
    switch (segment) {
      case "products":
        path = "/admin/products";
        break;
      case "categories":
        path = "/admin/categories";
        break;
      // Add more cases for other admin sections as needed
      // case "users":
      //   path = "/admin/users";
      //   break;
      default:
        break;
    }

    breadcrumbArray.push({
      name: segment.charAt(0).toUpperCase() + segment.slice(1), // Capitalize segment name
      url: path,
    });
  });

  res.locals.breadcrumbs = breadcrumbArray; // Make breadcrumbs available in locals
  next();
});

module.exports = breadcrumbs;
