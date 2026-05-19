// models/Agent.js

const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema(
{
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    agencyName: {
        type: String
    },

    experience: {
        type: Number
    },

    specialization: {
        type: String
    },

    bio: {
        type: String
    },

    rating: {
        type: Number,
        default: 0
    }
},
{
    timestamps: true
}
);

module.exports = mongoose.model("Agent", agentSchema);