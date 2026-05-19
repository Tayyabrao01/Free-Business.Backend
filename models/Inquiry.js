// models/Inquiry.js

const mongoose = require("mongoose");

const inquirySchema = new mongoose.Schema(
{
    property: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Property"
    },

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    message: {
        type: String,
        required: true
    },

    phone: {
        type: String
    }
},
{
    timestamps: true
}
);

module.exports = mongoose.model("Inquiry", inquirySchema);