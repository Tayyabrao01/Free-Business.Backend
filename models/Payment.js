// models/Payment.js

const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
{
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    property: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Property"
    },

    amount: {
        type: Number,
        required: true
    },

    paymentMethod: {
        type: String,
        enum: ["stripe", "paypal", "bank"]
    },

    paymentStatus: {
        type: String,
        enum: ["pending", "completed", "failed"],
        default: "pending"
    }
},
{
    timestamps: true
}
);

module.exports = mongoose.model("Payment", paymentSchema);