const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
  {
    offerType: {
      type: String,
      enum: ["product", "category", "referral"],
      required: true,
    },
    offerName: {
      type: String,
      required: true,
    },
    discount: {
      type: Number,
      required: true,
    },
    productIds: [{ 
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: function () {
        return this.offerType === "product";
      },
    }],
    categoryIds: [{ 
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: function () {
        return this.offerType === "category";
      },
    }],
    referralCode: {
      type: String,
      required: function () {
        return this.offerType === "referral";
      },
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true },
);

const Offer = mongoose.model("Offer", offerSchema);

module.exports = Offer;
