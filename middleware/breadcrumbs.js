// middleware/breadcrumbs.js

const express = require("express");
const breadcrumbs = express.Router();

breadcrumbs.use((req, res, next) => {
  const pathArray = req.path.split("/").filter((segment) => segment !== "");
  const breadcrumbArray = [{ name: "Home", url: "/home" }]; // Initialize with Home link
  let path = "";

  pathArray.forEach((segment) => {
    path += `/${segment}`;

    // Replace "product" with "product-list" in breadcrumbs
     if (segment === "product") {
      path = "/product-list";
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
