// models/Property.js

const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema(
{
    title: {
        type: String,
        required: true
    },

    description: {
        type: String,
        required: true
    },

    price: {
        type: Number,
        required: true
    },

    propertyType: {
        type: String,
        enum: ["house", "apartment", "villa", "office", "shop"],
        required: true
    },

    purpose: {
        type: String,
        enum: ["sale", "rent"],
        required: true
    },

    bedrooms: {
        type: Number,
        default: 0
    },

    bathrooms: {
        type: Number,
        default: 0
    },

    area: {
        type: Number
    },

    address: {
        type: String
    },

    city: {
        type: String
    },

    images: [
        {
            type: String
        }
    ],

    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    isFeatured: {
        type: Boolean,
        default: false
    },

    status: {
        type: String,
        enum: ["available", "sold", "rented"],
        default: "available"
    }
},
{
    timestamps: true
}
);

propertySchema.index({ city: 1 });
propertySchema.index({ price: 1 });
propertySchema.index({ city: 1, price: 1 });

module.exports = mongoose.model("Property", propertySchema);