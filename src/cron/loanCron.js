const cron = require('node-cron');
const { checkAndUpdateOverdueLoans } = require('../controllers/Loans/LoansController');

// Cron job to check for overdue loans every day at 9 AM
cron.schedule('0 9 * * *', async () => {
    try {
        console.log('Running daily overdue loan check...');
        await checkAndUpdateOverdueLoans();
        console.log('Overdue loan check completed.');
    } catch (error) {
        console.error('Error in overdue loan cron job:', error);
    }
});

// Optional: Run overdue check every hour during business hours (9 AM to 6 PM)
cron.schedule('0 9-18 * * *', async () => {
    try {
        console.log('Running hourly overdue loan check...');
        await checkAndUpdateOverdueLoans();
        console.log('Hourly overdue loan check completed.');
    } catch (error) {
        console.error('Error in hourly overdue loan cron job:', error);
    }
});

console.log('Loan cron jobs scheduled successfully.');
