// models/User.js

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
{
    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    password: {
        type: String,
        required: true
    },

    location: {
        type: String,
        required: true
    },

    phone: {
        type: String
    },

    role: {
        type: String,
        enum: ["buyer", "seller", "agent", "admin"],
        default: "buyer"
    },

    profileImage: {
        type: String
    }
},
{
    timestamps: true
}
);

module.exports = mongoose.model("User", userSchema);