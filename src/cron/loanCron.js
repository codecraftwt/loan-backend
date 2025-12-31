const cron = require('node-cron');
const { checkAndUpdateOverdueLoans } = require('../controllers/Loans/LoansController');
const { updateBorrowerFraudStatus } = require('../services/fraudDetectionService');
const User = require('../models/User');
const Loan = require('../models/Loan');
const { sendFraudAlertNotification } = require('../services/notificationService');

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

        // console.log(`Fraud detection cron job completed. Updated: ${updatedCount}, Notified: ${notifiedCount}`);
    } catch (error) {
        console.error('Error in fraud detection cron job:', error);
    }
});