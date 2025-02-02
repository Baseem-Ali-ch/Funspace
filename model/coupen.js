
const mongoose = require('mongoose')
const couponSchema = new mongoose.Schema({
    couponCode:{
        type:String,
        required:true
    },
    discription:{
        type:String,
        required:true
    },
    discount:{
        type:Number,
    },
    minAmount:{
        type:Number,
        required:true
    },
    redeemAmount:{
        type:Number,
        required:true
    },
    isListed:{
        type:Boolean,
        required:true,
        default:false
    },
    addedDateTime:{
        type:Date,
        default:Date.now
    },
    expiryDate:{
        type:Date,
        required:true,

    }
})

const Coupon = mongoose.model('Coupon',couponSchema)
module.exports = Coupon