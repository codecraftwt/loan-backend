// const cron = require('node-cron');
// const Subscription = require('../models/Subscription');
// const User = require('../models/User');
// const { sendSubscriptionExpiryEmail } = require('../utils/mailer');

// // Cron job to check for expired subscriptions once every day at midnight
// cron.schedule('0 0 * * *', async () => {
//     try {

//         const expiredSubscriptions = await Subscription.find({
//             isActive: true,
//             subscriptionExpiry: { $lt: new Date() },
//             expiryEmailSent: false,  // Only send if email hasn't been sent yet
//         });

//         // Mark each expired subscription as inactive and send the notification email
//         for (let subscription of expiredSubscriptions) {
//             subscription.isActive = false;
//             subscription.expiryEmailSent = true;
//             await subscription.save();

//             const user = await User.findById(subscription.user);
//             if (user) {
//                 // Send the subscription expiry email
//                 await sendSubscriptionExpiryEmail(user.email, subscription.subscriptionExpiry.toDateString());
//             }
//         }

//         console.log(`${expiredSubscriptions.length} expired subscriptions were marked as inactive and expiry emails sent.`);
//     } catch (error) {
//         console.error('Error in cron job:', error);
//     }
// });
