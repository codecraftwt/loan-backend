const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    userName: {
      type: String,
      required: true,
      trim: true,
    },
    mobileNo: {
      type: String,
      required: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    feedback: {
      type: String,
      trim: true,
    },

    selectedOptions: [
      {
        type: String,
      },
    ],

    isResolved: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ['submitted', 'reviewed', 'closed'],
      default: 'submitted',
    },
  },
  {
    timestamps: true,
    collection: 'ratings',
  }
);

module.exports = mongoose.model('Rating', ratingSchema);