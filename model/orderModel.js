const mongoose = require("mongoose");
// const addressModel = require('./addressModel');
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const orderSchema = new Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "userRegister",
    required: true,
  },

  address: {
    fullName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    town: {
      type: String,
      required: true,
    },
    streetAddress: {
      type: String,
      required: true,
    },
    apartment: {
      type: String,
     
    },
    state: {
      type: String,
      required: true,
    },
    postcode: {
      type: String,
      required: true,
    },
  },
  paymentMethod: {
    type: String,
    required: true,
  },
  items: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
      },
      order_status: {
        type: String,
        enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Returned", "Return Requested"],
        default: "Pending",
      },
      discountedPrice: { type: Number},
      cancelReason: {
        type: String,
      },
      returnReason: {
        type: String,
      },
      returnRequested: {
        type: Boolean,
        default: false,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  deliveryDate: {
    type: Date,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
  payment_status: {
    type: String,
    enum: ["Pending", "Completed", "Failed"],
    default: "Pending",
  },

  coupon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Coupon",
  },
  couponDiscountAmt: {
    type: Number,
    default: 0,
  },
  orderId: {
    type: String,
    unique: true,
    required: true,
  },

  returnRequestStatus: {
    type: String,
    enum: ["Pending", "Accepted", "Rejected"],
    default: "Pending",
  },
});

module.exports = mongoose.model("Order", orderSchema);
