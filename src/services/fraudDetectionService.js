const Loan = require('../models/Loan');
const User = require('../models/User');

// Fraud detection configuration
const FRAUD_CONFIG = {
  multipleLoans: {
    threshold30Days: 3,      // 3+ loans in 30 days = flag
    threshold90Days: 5,      // 5+ loans in 90 days = flag
    threshold180Days: 8,     // 8+ loans in 180 days = flag
  },
  pendingLoans: {
    threshold: 3,            // 3+ pending loans = flag
    criticalThreshold: 5,    // 5+ pending loans = critical
  },
  overdueLoans: {
    threshold: 1,            // 1+ overdue loans = flag
    criticalDays: 30,        // 30+ days overdue = critical
    severeDays: 60,          // 60+ days overdue = severe
  },
  scoring: {
    multipleLoans30Days: 20,   // Points for multiple loans in 30 days
    multipleLoans90Days: 15,   // Points for multiple loans in 90 days
    pendingLoan: 10,           // Points per pending loan
    overdueLoan: 25,           // Points per overdue loan
    severeOverdue: 50,         // Additional points for severe overdue (60+ days)
  },
  riskLevels: {
    low: { min: 0, max: 29 },
    medium: { min: 30, max: 59 },
    high: { min: 60, max: 89 },
    critical: { min: 90, max: Infinity },
  },
};

/**
 * Check for multiple loans in short time periods
 */
async function checkMultipleLoans(aadhaarNumber) {
  try {
    const now = new Date();
    const date30DaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const date90DaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const date180DaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    // Get all accepted loans
    const allLoans = await Loan.find({
      aadhaarNumber,
      borrowerAcceptanceStatus: 'accepted',
    }).sort({ loanStartDate: -1 });

    // Count loans in different time periods
    const loansIn30Days = allLoans.filter(
      loan => new Date(loan.loanStartDate) >= date30DaysAgo
    ).length;

    const loansIn90Days = allLoans.filter(
      loan => new Date(loan.loanStartDate) >= date90DaysAgo
    ).length;

    const loansIn180Days = allLoans.filter(
      loan => new Date(loan.loanStartDate) >= date180DaysAgo
    ).length;

    return {
      totalActiveLoans: allLoans.length,
      loansIn30Days,
      loansIn90Days,
      loansIn180Days,
      flagged: loansIn30Days >= FRAUD_CONFIG.multipleLoans.threshold30Days ||
               loansIn90Days >= FRAUD_CONFIG.multipleLoans.threshold90Days ||
               loansIn180Days >= FRAUD_CONFIG.multipleLoans.threshold180Days,
    };
  } catch (error) {
    console.error('Error checking multiple loans:', error);
    return {
      totalActiveLoans: 0,
      loansIn30Days: 0,
      loansIn90Days: 0,
      loansIn180Days: 0,
      flagged: false,
    };
  }
}

/**
 * Check for pending loans (not paid, not overdue)
 */
async function checkPendingLoans(aadhaarNumber) {
  try {
    const now = new Date();
    const pendingLoans = await Loan.find({
      aadhaarNumber,
      borrowerAcceptanceStatus: 'accepted',
      paymentStatus: { $in: ['pending', 'part paid'] },
      remainingAmount: { $gt: 0 },
    });

    // Filter out overdue loans
    const actualPendingLoans = pendingLoans.filter(loan => {
      const loanEndDate = loan.loanEndDate ? new Date(loan.loanEndDate) : null;
      const isOverdue = 
        loan.paymentStatus === 'overdue' ||
        (loan.overdueDetails && loan.overdueDetails.isOverdue === true) ||
        (loanEndDate && loanEndDate < now && loan.remainingAmount > 0 && loan.paymentStatus !== 'paid');
      
      return !isOverdue;
    });

    const pendingCount = actualPendingLoans.length;
    const pendingAmount = actualPendingLoans.reduce(
      (sum, loan) => sum + (loan.remainingAmount || loan.amount || 0),
      0
    );

    return {
      count: pendingCount,
      amount: pendingAmount,
      flagged: pendingCount >= FRAUD_CONFIG.pendingLoans.threshold,
      critical: pendingCount >= FRAUD_CONFIG.pendingLoans.criticalThreshold,
      loans: actualPendingLoans.map(loan => ({
        loanId: loan._id,
        amount: loan.amount,
        remainingAmount: loan.remainingAmount,
        paymentStatus: loan.paymentStatus,
      })),
    };
  } catch (error) {
    console.error('Error checking pending loans:', error);
    return { count: 0, amount: 0, flagged: false, critical: false, loans: [] };
  }
}

/**
 * Check for overdue loans
 */
async function checkOverdueLoans(aadhaarNumber) {
  try {
    const now = new Date();
    const overdueLoans = await Loan.find({
      aadhaarNumber,
      borrowerAcceptanceStatus: 'accepted',
      $or: [
        { paymentStatus: 'overdue' },
        { 'overdueDetails.isOverdue': true },
        {
          loanEndDate: { $lt: now },
          remainingAmount: { $gt: 0 },
          paymentStatus: { $ne: 'paid' },
        },
      ],
    });

    let maxOverdueDays = 0;
    let totalOverdueAmount = 0;
    let criticalOverdueCount = 0;
    let severeOverdueCount = 0;

    overdueLoans.forEach(loan => {
      const overdueDays = loan.overdueDetails?.overdueDays ||
        Math.floor((now - new Date(loan.loanEndDate)) / (1000 * 60 * 60 * 24));
      
      maxOverdueDays = Math.max(maxOverdueDays, overdueDays);
      totalOverdueAmount += loan.overdueDetails?.overdueAmount || loan.remainingAmount || 0;

      if (overdueDays >= FRAUD_CONFIG.overdueLoans.severeDays) {
        severeOverdueCount++;
      } else if (overdueDays >= FRAUD_CONFIG.overdueLoans.criticalDays) {
        criticalOverdueCount++;
      }
    });

    return {
      count: overdueLoans.length,
      amount: totalOverdueAmount,
      maxOverdueDays,
      criticalOverdueCount,
      severeOverdueCount,
      flagged: overdueLoans.length >= FRAUD_CONFIG.overdueLoans.threshold,
      critical: criticalOverdueCount > 0 || severeOverdueCount > 0,
      loans: overdueLoans.map(loan => ({
        loanId: loan._id,
        amount: loan.amount,
        overdueAmount: loan.overdueDetails?.overdueAmount || loan.remainingAmount,
        overdueDays: loan.overdueDetails?.overdueDays ||
          Math.floor((now - new Date(loan.loanEndDate)) / (1000 * 60 * 60 * 24)),
      })),
    };
  } catch (error) {
    console.error('Error checking overdue loans:', error);
    return {
      count: 0,
      amount: 0,
      maxOverdueDays: 0,
      criticalOverdueCount: 0,
      severeOverdueCount: 0,
      flagged: false,
      critical: false,
      loans: [],
    };
  }
}

/**
 * Calculate fraud score based on various factors
 */
function calculateFraudScore(multipleLoans, pendingLoans, overdueLoans) {
  let score = 0;

  // Multiple loans scoring
  if (multipleLoans.loansIn30Days >= FRAUD_CONFIG.multipleLoans.threshold30Days) {
    score += FRAUD_CONFIG.scoring.multipleLoans30Days;
  }
  if (multipleLoans.loansIn90Days >= FRAUD_CONFIG.multipleLoans.threshold90Days) {
    score += FRAUD_CONFIG.scoring.multipleLoans90Days;
  }

  // Pending loans scoring
  score += pendingLoans.count * FRAUD_CONFIG.scoring.pendingLoan;

  // Overdue loans scoring
  score += overdueLoans.count * FRAUD_CONFIG.scoring.overdueLoan;
  if (overdueLoans.severeOverdueCount > 0) {
    score += overdueLoans.severeOverdueCount * FRAUD_CONFIG.scoring.severeOverdue;
  }

  return Math.min(score, 100); // Cap at 100
}

/**
 * Determine risk level based on fraud score
 */
function determineRiskLevel(fraudScore) {
  if (fraudScore >= FRAUD_CONFIG.riskLevels.critical.min) {
    return 'critical';
  } else if (fraudScore >= FRAUD_CONFIG.riskLevels.high.min) {
    return 'high';
  } else if (fraudScore >= FRAUD_CONFIG.riskLevels.medium.min) {
    return 'medium';
  }
  return 'low';
}

/**
 * Generate recommendation based on fraud details
 */
function generateRecommendation(riskLevel, fraudScore, multipleLoans, pendingLoans, overdueLoans) {
  if (riskLevel === 'critical') {
    return 'CRITICAL RISK: Do not proceed with this loan. Borrower has severe fraud indicators.';
  } else if (riskLevel === 'high') {
    return 'HIGH RISK: Proceed with extreme caution. Consider additional verification and collateral.';
  } else if (riskLevel === 'medium') {
    return 'MEDIUM RISK: Proceed with caution. Review borrower history carefully.';
  }
  return 'LOW RISK: Borrower appears to be low risk.';
}

/**
 * Get fraud details for a borrower (without updating database)
 */
async function getFraudDetails(aadhaarNumber) {
  try {
    // Check all fraud indicators
    const multipleLoans = await checkMultipleLoans(aadhaarNumber);
    const pendingLoans = await checkPendingLoans(aadhaarNumber);
    const overdueLoans = await checkOverdueLoans(aadhaarNumber);

    // Calculate fraud score
    const fraudScore = calculateFraudScore(multipleLoans, pendingLoans, overdueLoans);

    // Determine risk level
    const riskLevel = determineRiskLevel(fraudScore);

    // Generate recommendation
    const recommendation = generateRecommendation(
      riskLevel,
      fraudScore,
      multipleLoans,
      pendingLoans,
      overdueLoans
    );

    return {
      fraudScore,
      riskLevel,
      flags: {
        multipleLoansInShortTime: multipleLoans.flagged,
        hasPendingLoans: pendingLoans.count > 0,
        hasOverdueLoans: overdueLoans.count > 0,
        totalActiveLoans: multipleLoans.totalActiveLoans,
        totalPendingLoans: pendingLoans.count,
        totalOverdueLoans: overdueLoans.count,
        lastFraudCheck: new Date(),
      },
      details: {
        multipleLoans,
        pendingLoans,
        overdueLoans,
      },
      recommendation,
    };
  } catch (error) {
    console.error('Error getting fraud details:', error);
    return {
      fraudScore: 0,
      riskLevel: 'low',
      flags: {
        multipleLoansInShortTime: false,
        hasPendingLoans: false,
        hasOverdueLoans: false,
        totalActiveLoans: 0,
        totalPendingLoans: 0,
        totalOverdueLoans: 0,
        lastFraudCheck: new Date(),
      },
      details: {
        multipleLoans: { totalActiveLoans: 0, loansIn30Days: 0, loansIn90Days: 0, loansIn180Days: 0 },
        pendingLoans: { count: 0, amount: 0 },
        overdueLoans: { count: 0, amount: 0, maxOverdueDays: 0 },
      },
      recommendation: 'LOW RISK: Borrower appears to be low risk.',
    };
  }
}

/**
 * Update borrower fraud status in database
 */
async function updateBorrowerFraudStatus(borrowerId, aadhaarNumber) {
  try {
    // Get fraud details
    const fraudDetails = await getFraudDetails(aadhaarNumber);

    // Update user's fraud detection fields
    const user = await User.findById(borrowerId);
    if (!user) {
      throw new Error('Borrower not found');
    }

    // Prepare fraud history entry
    const fraudHistoryEntry = {
      detectedAt: new Date(),
      fraudScore: fraudDetails.fraudScore,
      riskLevel: fraudDetails.riskLevel,
      reason: generateRecommendation(
        fraudDetails.riskLevel,
        fraudDetails.fraudScore,
        fraudDetails.details.multipleLoans,
        fraudDetails.details.pendingLoans,
        fraudDetails.details.overdueLoans
      ),
      details: {
        multipleLoans: fraudDetails.details.multipleLoans,
        pendingLoans: fraudDetails.details.pendingLoans,
        overdueLoans: fraudDetails.details.overdueLoans,
      },
    };

    // Update user fraud detection
    user.fraudDetection = {
      fraudScore: fraudDetails.fraudScore,
      riskLevel: fraudDetails.riskLevel,
      flags: {
        multipleLoansInShortTime: fraudDetails.flags.multipleLoansInShortTime,
        hasPendingLoans: fraudDetails.flags.hasPendingLoans,
        hasOverdueLoans: fraudDetails.flags.hasOverdueLoans,
        totalActiveLoans: fraudDetails.flags.totalActiveLoans,
        totalPendingLoans: fraudDetails.flags.totalPendingLoans,
        totalOverdueLoans: fraudDetails.flags.totalOverdueLoans,
        lastFraudCheck: new Date(),
      },
      fraudHistory: [
        ...(user.fraudDetection?.fraudHistory || []),
        fraudHistoryEntry,
      ].slice(-10), // Keep last 10 entries
    };

    await user.save();

    return fraudDetails;
  } catch (error) {
    console.error('Error updating borrower fraud status:', error);
    throw error;
  }
}

module.exports = {
  getFraudDetails,
  updateBorrowerFraudStatus,
};
