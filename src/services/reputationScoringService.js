const Loan = require("../models/Loan");

/**
 * Calculate borrower reputation score (0-100) based on loan history
 * @param {String} aadhaarNumber - Borrower's Aadhaar number
 * @returns {Object} Reputation score and detailed metrics
 */
async function calculateBorrowerReputation(aadhaarNumber) {
  try {
    // Get all loans for this borrower
    const allLoans = await Loan.find({ aadhaarNumber }).lean();

    if (!allLoans || allLoans.length === 0) {
      return {
        reputationScore: 50, // Default score for new borrowers
        metrics: {
          totalLoans: 0,
          totalPaidLoans: 0,
          totalPendingLoans: 0,
          totalPartPaidLoans: 0,
          overdueLoans: 0,
          totalOverdueDays: 0,
          onTimePayments: 0,
          totalPayments: 0,
          onTimePaymentRate: 0,
        },
        breakdown: {
          score: 50,
          message: "No loan history available",
        },
      };
    }

    // Initialize metrics
    let totalLoans = allLoans.length;
    let totalPaidLoans = 0;
    let totalPendingLoans = 0;
    let totalPartPaidLoans = 0;
    let overdueLoans = 0;
    let totalOverdueDays = 0;
    let onTimePayments = 0;
    let totalPayments = 0;

    const currentDate = new Date();

    // Process each loan
    allLoans.forEach((loan) => {
      // Count loans by status
      if (loan.paymentStatus === "paid") {
        totalPaidLoans++;
      } else if (loan.paymentStatus === "pending") {
        totalPendingLoans++;
      } else if (loan.paymentStatus === "part paid") {
        totalPartPaidLoans++;
      }

      // Check for overdue loans
      const isOverdue =
        loan.paymentStatus === "overdue" ||
        (loan.overdueDetails && loan.overdueDetails.isOverdue);

      if (isOverdue) {
        overdueLoans++;
        const overdueDays =
          loan.overdueDetails?.overdueDays ||
          (loan.loanEndDate
            ? Math.max(
                0,
                Math.floor((currentDate - new Date(loan.loanEndDate)) / (1000 * 60 * 60 * 24))
              )
            : 0);
        totalOverdueDays += overdueDays;
      }

      // Calculate on-time payments
      if (loan.paymentHistory && Array.isArray(loan.paymentHistory)) {
        const confirmedPayments = loan.paymentHistory.filter(
          (p) => p.paymentStatus === "confirmed"
        );

        confirmedPayments.forEach((payment) => {
          totalPayments++;

          // Check if payment was on time
          // For installment loans, check against nextDueDate
          // For one-time loans, check against loanEndDate
          let dueDate = null;

          if (payment.paymentType === "installment") {
            // For installments, we consider it on-time if paid before or on the due date
            // Since we don't have exact due dates for each installment in history,
            // we'll use a heuristic: if loan is not overdue, payments are likely on-time
            if (!isOverdue && loan.paymentStatus !== "overdue") {
              dueDate = loan.installmentPlan?.nextDueDate || loan.loanEndDate;
            } else {
              dueDate = loan.loanEndDate;
            }
          } else {
            // One-time payment
            dueDate = loan.loanEndDate;
          }

          if (dueDate) {
            const paymentDate = new Date(payment.confirmedAt || payment.paymentDate);
            const dueDateObj = new Date(dueDate);

            // Payment is on-time if paid on or before due date
            if (paymentDate <= dueDateObj) {
              onTimePayments++;
            }
          } else {
            // If no due date, consider it on-time if loan is not overdue
            if (!isOverdue) {
              onTimePayments++;
            }
          }
        });
      }
    });

    // Calculate on-time payment rate
    const onTimePaymentRate =
      totalPayments > 0 ? (onTimePayments / totalPayments) * 100 : 0;

    // Calculate reputation score (0-100)
    let score = 0;

    // Base score components (max 100 points)
    // 1. On-time payment rate (40 points max)
    const onTimeScore = Math.min(40, (onTimePaymentRate / 100) * 40);

    // 2. Paid loans ratio (30 points max)
    const paidLoansRatio = totalLoans > 0 ? totalPaidLoans / totalLoans : 0;
    const paidLoansScore = Math.min(30, paidLoansRatio * 30);

    // 3. Part paid loans (10 points max) - partial credit
    const partPaidRatio = totalLoans > 0 ? totalPartPaidLoans / totalLoans : 0;
    const partPaidScore = Math.min(10, partPaidRatio * 10);

    // 4. Penalties for overdue loans (deduct up to 30 points)
    const overdueRatio = totalLoans > 0 ? overdueLoans / totalLoans : 0;
    const overduePenalty = Math.min(30, overdueRatio * 30);

    // 5. Penalty for overdue days (deduct up to 20 points)
    // More overdue days = more penalty
    // Average overdue days per overdue loan
    const avgOverdueDays =
      overdueLoans > 0 ? totalOverdueDays / overdueLoans : 0;
    // Penalty increases with average overdue days (max 20 points)
    // 0 days = 0 penalty, 30+ days = 20 penalty
    const overdueDaysPenalty = Math.min(20, (avgOverdueDays / 30) * 20);

    // 6. Pending loans penalty (deduct up to 10 points)
    // Too many pending loans is a negative signal
    const pendingRatio = totalLoans > 0 ? totalPendingLoans / totalLoans : 0;
    const pendingPenalty = Math.min(10, pendingRatio * 10);

    // Calculate final score
    score =
      onTimeScore +
      paidLoansScore +
      partPaidScore -
      overduePenalty -
      overdueDaysPenalty -
      pendingPenalty;

    // Ensure score is between 0 and 100
    score = Math.max(0, Math.min(100, Math.round(score * 100) / 100));

    // Determine reputation level
    let reputationLevel = "Poor";
    let reputationColor = "#dc3545"; // Red

    if (score >= 80) {
      reputationLevel = "Excellent";
      reputationColor = "#28a745"; // Green
    } else if (score >= 65) {
      reputationLevel = "Good";
      reputationColor = "#17a2b8"; // Blue
    } else if (score >= 50) {
      reputationLevel = "Fair";
      reputationColor = "#ffc107"; // Yellow
    } else if (score >= 35) {
      reputationLevel = "Below Average";
      reputationColor = "#fd7e14"; // Orange
    }

    return {
      reputationScore: score,
      reputationLevel,
      reputationColor,
      metrics: {
        totalLoans,
        totalPaidLoans,
        totalPendingLoans,
        totalPartPaidLoans,
        overdueLoans,
        totalOverdueDays,
        averageOverdueDays: overdueLoans > 0 ? Math.round((totalOverdueDays / overdueLoans) * 100) / 100 : 0,
        onTimePayments,
        totalPayments,
        onTimePaymentRate: Math.round(onTimePaymentRate * 100) / 100,
      },
      breakdown: {
        onTimeScore: Math.round(onTimeScore * 100) / 100,
        paidLoansScore: Math.round(paidLoansScore * 100) / 100,
        partPaidScore: Math.round(partPaidScore * 100) / 100,
        overduePenalty: Math.round(overduePenalty * 100) / 100,
        overdueDaysPenalty: Math.round(overdueDaysPenalty * 100) / 100,
        pendingPenalty: Math.round(pendingPenalty * 100) / 100,
        finalScore: score,
      },
    };
  } catch (error) {
    console.error("Error calculating borrower reputation:", error);
    throw error;
  }
}

/**
 * Get reputation score for a borrower by Aadhaar number
 * @param {String} aadhaarNumber - Borrower's Aadhaar number
 * @returns {Object} Reputation score and metrics
 */
async function getBorrowerReputation(aadhaarNumber) {
  return await calculateBorrowerReputation(aadhaarNumber);
}

module.exports = {
  calculateBorrowerReputation,
  getBorrowerReputation,
};









