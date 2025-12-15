// src/services/razorpayService.js
const Razorpay = require('razorpay');
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_eXyUgxz2VtmepU',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'IOULEZFaWRNrL92MNqF5eDr0'
});

class RazorpayService {
  // Create Razorpay customer
  async createCustomer(user) {
    try {
      const customer = await razorpay.customers.create({
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        contact: user.mobileNo,
        notes: {
          userId: user._id.toString()
        }
      });
      return customer;
    } catch (error) {
      console.error('Error creating Razorpay customer:', error);
      throw new Error(`Failed to create customer: ${error.message}`);
    }
  }

  // Create subscription
  async createSubscription(user, plan, billingCycle = 'monthly') {
    try {
      const planData = await Plan.findOne({ name: plan });
      if (!planData) {
        throw new Error('Plan not found');
      }

      // Check if customer exists, create if not
      let customer;
      const existingSubscriptions = await Subscription.find({ user: user._id });
      
      if (existingSubscriptions.length > 0) {
        // Use existing customer
        const lastSub = existingSubscriptions[0];
        customer = { id: lastSub.razorpayCustomerId };
      } else {
        // Create new customer
        customer = await this.createCustomer(user);
      }

      // Get plan ID based on billing cycle
      const razorpayPlanId = billingCycle === 'yearly' 
        ? planData.razorpayPlanIdYearly 
        : planData.razorpayPlanIdMonthly;

      if (!razorpayPlanId) {
        throw new Error(`Razorpay plan ID not found for ${billingCycle} billing`);
      }

      // Create subscription in Razorpay
      const subscription = await razorpay.subscriptions.create({
        plan_id: razorpayPlanId,
        customer_id: customer.id,
        total_count: billingCycle === 'yearly' ? 1 : 12, // 1 year or 12 months
        quantity: 1,
        start_at: Math.floor(Date.now() / 1000) + 300, // Start in 5 minutes
        expire_by: Math.floor(Date.now() / 1000) + 31536000, // Expire in 1 year
        notes: {
          userId: user._id.toString(),
          plan: plan,
          billingCycle: billingCycle
        }
      });

      return {
        subscription,
        customer,
        planData
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw new Error(`Failed to create subscription: ${error.message}`);
    }
  }

  // Verify payment
  async verifyPayment(razorpayPaymentId, razorpaySubscriptionId, razorpaySignature) {
    try {
      const crypto = require('crypto');
      
      const body = razorpayPaymentId + "|" + razorpaySubscriptionId;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

      return expectedSignature === razorpaySignature;
    } catch (error) {
      console.error('Error verifying payment:', error);
      return false;
    }
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId) {
    try {
      const subscription = await razorpay.subscriptions.cancel(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  // Fetch subscription details
  async getSubscriptionDetails(subscriptionId) {
    try {
      const subscription = await razorpay.subscriptions.fetch(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('Error fetching subscription:', error);
      throw new Error(`Failed to fetch subscription: ${error.message}`);
    }
  }

  // Fetch all invoices for subscription
  async getInvoices(subscriptionId) {
    try {
      const invoices = await razorpay.invoices.all({
        subscription_id: subscriptionId
      });
      return invoices;
    } catch (error) {
      console.error('Error fetching invoices:', error);
      throw new Error(`Failed to fetch invoices: ${error.message}`);
    }
  }
}

module.exports = new RazorpayService();