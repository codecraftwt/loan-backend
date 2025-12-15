// src/models/Plan.js
const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: String,
  priceMonthly: {
    type: Number,
    required: true
  },
  priceYearly: Number,
  razorpayPlanIdMonthly: String,
  razorpayPlanIdYearly: String,
  features: {
    maxLoans: {
      type: Number,
      required: true
    },
    maxLoanAmount: Number,
    advancedAnalytics: Boolean,
    prioritySupport: Boolean
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Plan', planSchema);