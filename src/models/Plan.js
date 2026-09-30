const mongoose = require('mongoose');

const DEFAULT_SERVICES = [
  "Unlimited Borrower Applications Access",
  "Direct Borrower Phone, Email & KYC Access",
  "AI Document Review & Risk Grade Analysis",
  "Custom Term Sheets & Deal Structuring",
  "Multi-Deal Pipeline & Active Workspace",
  "Priority Technical & Underwriting Support",
];

const planSchema = new mongoose.Schema({
  planName: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: "",
  },
  duration: {
    type: String,
    required: true,
    enum: ["1 month", "2 months", "3 months", "6 months", "1 year"],
    default: "1 month",
  },
  durationDays: {
    type: Number,
    required: true,
    default: 30,
  },
  price: {
    type: Number,
    required: true,
    default: 1999, // Total pack price
  },
  priceMonthly: {
    type: Number,
    required: true,
    default: 1999, // Monthly effective rate
  },
  tag: {
    type: String,
    default: "", // e.g. "Most Popular", "Best Value", "Save 25%"
  },
  allServicesIncluded: {
    type: Boolean,
    default: true,
  },
  servicesList: {
    type: [String],
    default: DEFAULT_SERVICES,
  },
  planFeatures: {
    unlimitedLoans: {
      type: Boolean,
      default: true,
    },
    advancedAnalytics: {
      type: Boolean,
      default: true,
    },
    prioritySupport: {
      type: Boolean,
      default: true,
    },
    maxActiveDeals: {
      type: Number,
      default: 100,
    },
    aiDocumentReviewCredits: {
      type: Number,
      default: 500,
    },
    customTermSheets: {
      type: Boolean,
      default: true,
    },
    teamMembersLimit: {
      type: Number,
      default: 10,
    },
  },
  tier: {
    type: String,
    enum: ["starter", "professional", "enterprise", "quarterly", "half-yearly", "annual"],
    default: "starter",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

const Plan = mongoose.model('Plan', planSchema);

// Function to drop old index (called after DB connection)
Plan.dropOldNameIndex = async () => {
  try {
    const indexes = await Plan.collection.getIndexes();
    if (indexes.name_1) {
      await Plan.collection.dropIndex('name_1');
    }
  } catch (err) {
    if (err.code !== 27 && err.code !== 'IndexNotFound') {
      console.log('Note: Could not drop old name_1 index:', err.message);
    }
  }
};

module.exports = Plan;