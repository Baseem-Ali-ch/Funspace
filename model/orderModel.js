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
      required: true,
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
  order_status: {
    type: String,
    enum: ["Pending", "Processing", "Shipped", "Deliverd", "Cancel", "Returned"],
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
});

module.exports = mongoose.model("Order", orderSchema);
