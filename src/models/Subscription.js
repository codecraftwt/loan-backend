const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  duration: {
    type: String,
    enum: ['monthly', 'yearly', 'quarterly', 'custom'],
    required: true
  },
  durationInMonths: {
    type: Number,
    required: true,
    min: 1
  },
  features: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  razorpayPlanId: {
    type: String,
    sparse: true
  },
  maxLoans: {
    type: Number,
    default: 0 // 0 means unlimited
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("Subscription", subscriptionSchema);