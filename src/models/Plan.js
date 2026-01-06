const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  planName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ""
  },
  duration: {
    type: String,
    required: true,
    enum: ["1 month", "2 months", "3 months", "6 months", "1 year"],
    default: "1 month"
  },
  priceMonthly: {
    type: Number,
    required: true
  },
  planFeatures: {
    unlimitedLoans: {
      type: Boolean,
      default: true // All plans have unlimited loans
    },
    advancedAnalytics: {
      type: Boolean,
      default: false
    },
    prioritySupport: {
      type: Boolean,
      default: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
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
    // Index might not exist or already dropped, ignore error
    if (err.code !== 27 && err.code !== 'IndexNotFound') {
      console.log('Note: Could not drop old name_1 index:', err.message);
    }
  }
};

module.exports = Plan;