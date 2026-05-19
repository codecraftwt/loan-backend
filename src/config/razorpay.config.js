const Razorpay = require('razorpay');

// old test configs
// const razorpayInstance = new Razorpay({
//   key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_eXyUgxz2VtmepU',
//   key_secret: process.env.RAZORPAY_KEY_SECRET || 'IOULEZFaWRNrL92MNqF5eDr0'
// });

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_SN1JoYwhNqRjPV',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'tU0NirIbZRB7qDM2r50EgcCG'
});

module.exports = razorpayInstance;


