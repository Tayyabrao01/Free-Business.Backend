const Payment = require("../models/Payment");
const Property = require("../models/Property");

const createPayment = async (req, res) => {
  try {
    const { property, amount, paymentMethod } = req.body;
    if (!property || amount === undefined || !paymentMethod) {
      return res.status(400).json({ message: "Property, amount, and payment method are required" });
    }

    const propertyRecord = await Property.findById(property);
    if (!propertyRecord) {
      return res.status(404).json({ message: "Property not found" });
    }

    const payment = await Payment.create({
      user: req.user._id,
      property,
      amount,
      paymentMethod,
      paymentStatus: "pending",
    });

    return res.status(201).json({ message: "Payment created successfully", payment });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create payment", error: error.message });
  }
};

const getPayments = async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { user: req.user._id };
    const payments = await Payment.find(filter)
      .populate("property", "title price city")
      .populate("user", "name email");
    return res.status(200).json(payments);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch payments", error: error.message });
  }
};

const getPayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate("property", "title price city")
      .populate("user", "name email");
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (req.user.role !== "admin" && payment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to view this payment" });
    }

    return res.status(200).json(payment);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch payment", error: error.message });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const { paymentStatus } = req.body;
    if (!paymentStatus || !["pending", "completed", "failed"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status" });
    }

    payment.paymentStatus = paymentStatus;
    await payment.save();

    return res.status(200).json({ message: "Payment status updated", payment });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update payment status", error: error.message });
  }
};

module.exports = {
  createPayment,
  getPayments,
  getPayment,
  updatePaymentStatus,
};
