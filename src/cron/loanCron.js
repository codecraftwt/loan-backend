const cron = require('node-cron');
const { checkAndUpdateOverdueLoans } = require('../controllers/Loans/LoansController');
const { updateBorrowerFraudStatus } = require('../services/fraudDetectionService');
const User = require('../models/User');
const Loan = require('../models/Loan');
const Plan = require('../models/Plan');
const { 
  sendFraudAlertNotification,
  sendOverdueLoanNotificationToLender,
  sendOverdueLoanNotificationToBorrower,
  sendPendingPaymentNotificationToLender,
  sendPendingLoanNotificationToLender,
  sendPendingLoanNotificationToBorrower,
  sendSubscriptionReminderNotification
} = require('../services/notificationService');

// Cron job to check for overdue loans every day at 9 AM
cron.schedule('0 9 * * *', async () => {
    try {
        await checkAndUpdateOverdueLoans();
    } catch (error) {
        console.error('Error in overdue loan cron job:', error);
    }
});

// Optional: Run overdue check every hour during business hours (9 AM to 6 PM)
cron.schedule('0 9-18 * * *', async () => {
    try {
        await checkAndUpdateOverdueLoans();
    } catch (error) {
        console.error('Error in hourly overdue loan cron job:', error);
    }
});

// Cron job to check and update fraud status for all borrowers (daily at 10 AM)
cron.schedule('0 10 * * *', async () => {
    try {        
        // Get all borrowers
        const borrowers = await User.find({ roleId: 2, isActive: true });
        
        let updatedCount = 0;
        let notifiedCount = 0;

        for (const borrower of borrowers) {
            try {
                // Get all unique lenders who have loans with this borrower
                const loans = await Loan.find({ 
                    aadhaarNumber: borrower.aadharCardNo,
                    loanConfirmed: true,
                    borrowerAcceptanceStatus: 'accepted'
                }).select('lenderId').distinct('lenderId');

                // Get previous fraud status
                const previousRiskLevel = borrower.fraudDetection?.riskLevel || 'low';
                const previousScore = borrower.fraudDetection?.fraudScore || 0;

                // Update fraud status
                const fraudDetails = await updateBorrowerFraudStatus(
                    borrower._id,
                    borrower.aadharCardNo
                );

                if (fraudDetails) {
                    updatedCount++;

                    // Notify lenders if risk level increased or reached high/critical
                    if (
                        fraudDetails.riskLevel !== 'low' &&
                        (fraudDetails.riskLevel !== previousRiskLevel ||
                         fraudDetails.fraudScore > previousScore + 10)
                    ) {
                        // Notify all lenders who have loans with this borrower
                        for (const lenderId of loans) {
                            try {
                                await sendFraudAlertNotification(
                                    lenderId,
                                    {
                                        fraudScore: fraudDetails.fraudScore,
                                        riskLevel: fraudDetails.riskLevel,
                                        totalOverdueLoans: fraudDetails.flags.totalOverdueLoans,
                                        totalPendingLoans: fraudDetails.flags.totalPendingLoans,
                                    },
                                    borrower.userName
                                );
                                notifiedCount++;
                            } catch (notifError) {
                                console.error(`Error notifying lender ${lenderId}:`, notifError);
                            }
                        }
                    }
                }
            } catch (borrowerError) {
                console.error(`Error processing borrower ${borrower._id}:`, borrowerError);
            }
        }
    } catch (error) {
        console.error('Error in fraud detection cron job:', error);
    }
});

// Cron job to send overdue loan notifications (daily at 10 AM)
cron.schedule('0 10 * * *', async () => {
    try {
        const currentDate = new Date();
        const overdueLoans = await Loan.find({
            'overdueDetails.isOverdue': true,
            paymentStatus: { $ne: 'paid' },
            loanConfirmed: true,
            borrowerAcceptanceStatus: 'accepted'
        })
        .populate('lenderId', 'userName')
        .lean();

        let lenderNotifiedCount = 0;
        let borrowerNotifiedCount = 0;

        for (const loan of overdueLoans) {
            try {
                // Get borrower details
                const borrower = await User.findOne({ aadharCardNo: loan.aadhaarNumber });
                const lenderName = loan.lenderId?.userName || 'Lender';
                const borrowerName = borrower?.userName || 'Borrower';

                // Send notification to lender
                if (loan.lenderId) {
                    await sendOverdueLoanNotificationToLender(
                        loan.lenderId._id,
                        loan,
                        borrowerName
                    );
                    lenderNotifiedCount++;
                }

                // Send notification to borrower
                if (borrower) {
                    await sendOverdueLoanNotificationToBorrower(
                        loan.aadhaarNumber,
                        loan,
                        lenderName
                    );
                    borrowerNotifiedCount++;
                }
            } catch (loanError) {
                console.error(`Error sending overdue notifications for loan ${loan._id}:`, loanError);
            }
        }
    } catch (error) {
        console.error('Error in overdue loan notification cron job:', error);
    }
});

// Cron job to send pending payment notifications to lenders (daily at 11 AM)
cron.schedule('0 11 * * *', async () => {
    try {
        const loansWithPendingPayments = await Loan.find({
            'paymentHistory.paymentStatus': 'pending',
            loanConfirmed: true,
            borrowerAcceptanceStatus: 'accepted'
        })
        .populate('lenderId', 'userName')
        .lean();

        let notifiedCount = 0;

        for (const loan of loansWithPendingPayments) {
            try {
                // Find pending payments
                const pendingPayments = loan.paymentHistory.filter(p => p.paymentStatus === 'pending');
                
                if (pendingPayments.length > 0 && loan.lenderId) {
                    // Get the most recent pending payment
                    const latestPendingPayment = pendingPayments[pendingPayments.length - 1];
                    
                    // Get borrower details
                    const borrower = await User.findOne({ aadharCardNo: loan.aadhaarNumber });
                    const borrowerName = borrower?.userName || 'Borrower';

                    // Send notification to lender
                    await sendPendingPaymentNotificationToLender(
                        loan.lenderId._id,
                        loan,
                        borrowerName,
                        latestPendingPayment.amount,
                        latestPendingPayment.paymentMode
                    );
                    notifiedCount++;
                }
            } catch (loanError) {
                console.error(`Error sending pending payment notification for loan ${loan._id}:`, loanError);
            }
        }
    } catch (error) {
        console.error('Error in pending payment notification cron job:', error);
    }
});

// Cron job to send pending loan notifications (daily at 12 PM)
cron.schedule('0 12 * * *', async () => {
    try {
        // Loans waiting for borrower acceptance
        const pendingLoans = await Loan.find({
            borrowerAcceptanceStatus: 'pending',
            loanConfirmed: false
        })
        .populate('lenderId', 'userName')
        .lean();

        let lenderNotifiedCount = 0;
        let borrowerNotifiedCount = 0;

        for (const loan of pendingLoans) {
            try {
                const borrower = await User.findOne({ aadharCardNo: loan.aadhaarNumber });
                const lenderName = loan.lenderId?.userName || 'Lender';
                const borrowerName = borrower?.userName || 'Borrower';

                // Notify lender
                if (loan.lenderId) {
                    await sendPendingLoanNotificationToLender(
                        loan.lenderId._id,
                        loan,
                        borrowerName
                    );
                    lenderNotifiedCount++;
                }

                // Notify borrower
                if (borrower) {
                    await sendPendingLoanNotificationToBorrower(
                        loan.aadhaarNumber,
                        loan,
                        lenderName
                    );
                    borrowerNotifiedCount++;
                }
            } catch (loanError) {
                console.error(`Error sending pending loan notification for loan ${loan._id}:`, loanError);
            }
        }
    } catch (error) {
        console.error('Error in pending loan notification cron job:', error);
    }
});

// Cron job to send subscription reminders (daily at 9 AM)
cron.schedule('0 9 * * *', async () => {
    try {
        const currentDate = new Date();
        const lenders = await User.find({
            roleId: 1, // Lenders only
            isActive: true,
            currentPlanId: { $exists: true, $ne: null },
            planExpiryDate: { $exists: true, $ne: null }
        })
        .populate('currentPlanId')
        .lean();

        let notifiedCount = 0;

        for (const lender of lenders) {
            try {
                if (!lender.planExpiryDate || !lender.currentPlanId) continue;

                const expiryDate = new Date(lender.planExpiryDate);
                const remainingDays = Math.ceil((expiryDate - currentDate) / (1000 * 60 * 60 * 24));

                // Send reminders at: 7 days, 3 days, 1 day, and on expiry day
                if (remainingDays === 7 || remainingDays === 3 || remainingDays === 1 || remainingDays === 0) {
                    await sendSubscriptionReminderNotification(
                        lender._id,
                        lender.currentPlanId.planName || 'Subscription',
                        remainingDays,
                        expiryDate
                    );
                    notifiedCount++;
                }
            } catch (lenderError) {
                console.error(`Error sending subscription reminder to lender ${lender._id}:`, lenderError);
            }
        }
    } catch (error) {
        console.error('Error in subscription reminder cron job:', error);
    }
});