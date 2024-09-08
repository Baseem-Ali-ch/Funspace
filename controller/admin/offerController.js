const Coupon = require("../../model/coupen"); // Adjust the path as necessary
const Cart = require("../../model/cartModel");
const Category = require("../../model/categoryModel");
const Product = require("../../model/productModel");
const Offer = require("../../model/offerModel");
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;


//=================================render add offer page====================================
const renderAddOfferPage = async (req, res) => {
    try {
      const products = await Product.find();
      const categories = await Category.find();
      const isAdmin = req.session.admin;
      res.render("add-offer", {
        isAdmin,
        products,
        categories,
      });
    } catch (error) {
      console.log(error);
    }
  };
  

//=================================render offer list page====================================
const offerList = async (req, res) => {
    const { search = "", page = 1 } = req.query;
    const limit = 10;
    const skip = (page - 1) * limit;
  
    try {
      const searchQuery = search
        ? {
            $or: [{ offerName: new RegExp(search, "i") }, { referralCode: new RegExp(search, "i") }],
          }
        : {};
  
      const totalOffers = await Offer.countDocuments(searchQuery);
  
      const offers = await Offer.find(searchQuery).populate("productIds").populate("categoryIds").skip(skip).limit(limit).lean();
  
      const totalPages = Math.ceil(totalOffers / limit);
  
      res.render("list-offer", {
        offers,
        search,
        currentPage: parseInt(page),
        totalPages,
        isAdmin: req.session.admin,
        products: await Product.find(),
        categories: await Category.find(),
      });
    } catch (error) {
      console.error("Error fetching offers:", error);
      res.status(500).send("Server error");
    }
  };
  

  //===================================add offer page====================================
  const addOffer = async (req, res) => {
    try {
      const { offerType, offerName, discount, productIds, categoryIds, referralCode, startDate, endDate } = req.body;
  
      const newOffer = new Offer({
        offerType,
        offerName,
        discount,
        productIds: offerType === "product" ? productIds : undefined, 
        categoryIds: offerType === "category" ? categoryIds : undefined,
        referralCode: offerType === "referral" ? referralCode : undefined,
        startDate,
        endDate,
      });
  
      await newOffer.save();
      res.status(200).json({ success: true, message: "Offer added successfully." });
    } catch (error) {
      console.error("Error adding offer:", error);
      res.status(500).json({ success: false, message: "Error adding offer." });
    }
  };
  

  //===================================== edit offer =================================
  const editOffer = async (req, res) => {
    console.log("Received data:", req.body);
    const { offerId, offerName, discount, offerType, status, products = [], categories = [] } = req.body;
  
    try {
      const offer = await Offer.findByIdAndUpdate(
        offerId,
        {
          offerName,
          discount,
          offerType,
          status,
          productIds: products.map(id => new ObjectId(id)),
          categoryIds: categories.map(id => new ObjectId(id)),
        },
        { new: true },
      );
  
      if (offer) {
        res.json({ success: true, offer });
      } else {
        res.status(404).json({ success: false, message: "Offer not found" });
      }
    } catch (error) {
      console.error("Error updating offer:", error);
      res.status(500).json({ success: false, message: "Error updating offer", error: error.message });
    }
  };
  const deleteOffer = async (req, res) => {
    try {
      const { offerId } = req.params;
  
      await Offer.findByIdAndDelete(offerId);
      res.status(200).json({ success: true, message: "Offer deleted successfully." });
    } catch (error) {
      console.error("Error deleting offer:", error);
      res.status(500).json({ success: false, message: "Error deleting offer." });
    }
  };


  module.exports = {
    renderAddOfferPage,
    offerList,
    addOffer,
    editOffer,
    deleteOffer,
  };
  