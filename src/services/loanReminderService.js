const Loan = require("../models/Loan");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { sendPushToUser, saveInAppNotification } = require("./notificationService");

/**
 * Format date for friendly human reading (e.g. "28 Oct 2026")
 */
const formatDate = (d) => {
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
};

/**
 * Check active loans and dispatch automated EMI & Due Date reminders to borrowers:
 * 1. Due Tomorrow (1 day prior alert)
 * 2. Due Today (Due date morning alert)
 * 3. Overdue / Passed (Overdue warning alert)
 *
 * @param {string|null} filterBorrowerId - Optional borrower ID to check on-demand
 * @returns {Promise<Object>} Summary counts of reminders sent
 */
async function checkAndSendEmiPaymentReminders(filterBorrowerId = null) {
  const stats = {
    totalLoansChecked: 0,
    dueTomorrowCount: 0,
    dueTodayCount: 0,
    overdueCount: 0,
    skippedAlreadySent: 0,
  };

  try {
    const now = new Date();
    // Boundaries for Today (midnight to midnight)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Boundaries for Tomorrow (midnight to midnight)
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowEnd = new Date(todayEnd.getTime() + 24 * 60 * 60 * 1000);

    // Query active loans
    const query = {
      loanConfirmed: true,
      borrowerAcceptanceStatus: "accepted",
      paymentStatus: { $ne: "paid" },
      remainingAmount: { $gt: 0 },
    };

    if (filterBorrowerId) {
      query.borrowerId = filterBorrowerId;
    }

    const loans = await Loan.find(query)
      .populate("borrowerId", "userName email mobileNo aadharCardNo")
      .populate("lenderId", "userName companyName email mobileNo");

    stats.totalLoansChecked = loans.length;

    for (const loan of loans) {
      try {
        // Resolve borrower
        let borrower = loan.borrowerId;
        if (!borrower && loan.aadhaarNumber) {
          borrower = await User.findOne({ aadharCardNo: loan.aadhaarNumber });
        }
        if (!borrower) continue;

        const lenderName =
          loan.lenderId?.companyName || loan.lenderId?.userName || "your lender";

        let loanModified = false;

        // ─── Case A: Loan has an installment schedule ───
        if (Array.isArray(loan.installments) && loan.installments.length > 0) {
          for (const inst of loan.installments) {
            // Only process non-paid installments
            if (inst.status === "paid" || inst.status === "waived") continue;

            const dueDate = new Date(inst.dueDate);
            if (isNaN(dueDate.getTime())) continue;

            const instAmount = Number(inst.totalAmount || inst.emiAmount || loan.monthlyEmi || 0);
            const installmentNum = inst.installmentNumber || 1;

            // 1. Due Tomorrow
            if (dueDate >= tomorrowStart && dueDate <= tomorrowEnd) {
              const alreadySent = await Notification.findOne({
                userId: borrower._id,
                type: "emi_due_tomorrow",
                "metadata.loanId": loan._id,
                "metadata.installmentNumber": installmentNum,
                createdAt: { $gte: todayStart, $lte: todayEnd },
              });

              if (!alreadySent) {
                const title = "EMI Due Tomorrow";
                const message = `Reminder: Your EMI of ₹${instAmount.toLocaleString("en-IN")} to ${lenderName} is due tomorrow (${formatDate(dueDate)}). Please ensure sufficient balance.`;

                await saveInAppNotification({
                  userId: borrower._id,
                  title,
                  message,
                  type: "emi_due_tomorrow",
                  metadata: {
                    loanId: loan._id,
                    installmentNumber: installmentNum,
                    amount: instAmount,
                    dueDate: inst.dueDate,
                    lenderName,
                    screen: "Notifications",
                  },
                });

                await sendPushToUser(borrower._id, title, message, {
                  type: "emi_due_tomorrow",
                  loanId: loan._id.toString(),
                  amount: instAmount.toString(),
                  dueDate: inst.dueDate.toISOString ? inst.dueDate.toISOString() : String(inst.dueDate),
                  lenderName,
                  screen: "Notifications",
                });

                stats.dueTomorrowCount++;
              } else {
                stats.skippedAlreadySent++;
              }
            }

            // 2. Due Today
            else if (dueDate >= todayStart && dueDate <= todayEnd) {
              const alreadySent = await Notification.findOne({
                userId: borrower._id,
                type: "emi_due_today",
                "metadata.loanId": loan._id,
                "metadata.installmentNumber": installmentNum,
                createdAt: { $gte: todayStart, $lte: todayEnd },
              });

              if (!alreadySent) {
                const title = "EMI Due Today";
                const message = `Action Required: Your EMI of ₹${instAmount.toLocaleString("en-IN")} to ${lenderName} is due today (${formatDate(dueDate)}). Pay today to avoid overdue charges.`;

                await saveInAppNotification({
                  userId: borrower._id,
                  title,
                  message,
                  type: "emi_due_today",
                  metadata: {
                    loanId: loan._id,
                    installmentNumber: installmentNum,
                    amount: instAmount,
                    dueDate: inst.dueDate,
                    lenderName,
                    screen: "Notifications",
                  },
                });

                await sendPushToUser(borrower._id, title, message, {
                  type: "emi_due_today",
                  loanId: loan._id.toString(),
                  amount: instAmount.toString(),
                  dueDate: inst.dueDate.toISOString ? inst.dueDate.toISOString() : String(inst.dueDate),
                  lenderName,
                  screen: "Notifications",
                });

                stats.dueTodayCount++;
              } else {
                stats.skippedAlreadySent++;
              }
            }

            // 3. Overdue / Passed
            else if (dueDate < todayStart) {
              if (inst.status !== "overdue") {
                inst.status = "overdue";
                loanModified = true;
              }

              const overdueDays = Math.max(
                1,
                Math.floor((todayStart.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
              );

              const alreadySent = await Notification.findOne({
                userId: borrower._id,
                type: "overdue_loan",
                "metadata.loanId": loan._id,
                "metadata.installmentNumber": installmentNum,
                createdAt: { $gte: todayStart, $lte: todayEnd },
              });

              if (!alreadySent) {
                const title = "EMI Payment Overdue";
                const message = `Alert: Your EMI of ₹${instAmount.toLocaleString("en-IN")} to ${lenderName} was due on ${formatDate(dueDate)} and is overdue by ${overdueDays} day${overdueDays > 1 ? "s" : ""}. Please pay immediately.`;

                await saveInAppNotification({
                  userId: borrower._id,
                  title,
                  message,
                  type: "overdue_loan",
                  metadata: {
                    loanId: loan._id,
                    installmentNumber: installmentNum,
                    amount: instAmount,
                    dueDate: inst.dueDate,
                    overdueDays,
                    lenderName,
                    screen: "Notifications",
                  },
                });

                await sendPushToUser(borrower._id, title, message, {
                  type: "overdue_loan",
                  loanId: loan._id.toString(),
                  amount: instAmount.toString(),
                  dueDate: inst.dueDate.toISOString ? inst.dueDate.toISOString() : String(inst.dueDate),
                  overdueDays: overdueDays.toString(),
                  lenderName,
                  screen: "Notifications",
                });

                stats.overdueCount++;
              } else {
                stats.skippedAlreadySent++;
              }
            }
          }
        }

        // ─── Case B: Bullet / One-time / Legacy Loan (check loanEndDate or nextDueDate) ───
        else {
          const targetDueDate =
            loan.installmentPlan?.nextDueDate || loan.loanEndDate;

          if (targetDueDate) {
            const dueDate = new Date(targetDueDate);
            if (!isNaN(dueDate.getTime())) {
              const amount = Number(loan.remainingAmount || loan.amount || 0);

              // 1. Due Tomorrow
              if (dueDate >= tomorrowStart && dueDate <= tomorrowEnd) {
                const alreadySent = await Notification.findOne({
                  userId: borrower._id,
                  type: "emi_due_tomorrow",
                  "metadata.loanId": loan._id,
                  createdAt: { $gte: todayStart, $lte: todayEnd },
                });

                if (!alreadySent) {
                  const title = "Loan Payment Due Tomorrow";
                  const message = `Reminder: Your loan payment of ₹${amount.toLocaleString("en-IN")} to ${lenderName} is due tomorrow (${formatDate(dueDate)}). Please ensure sufficient balance.`;

                  await saveInAppNotification({
                    userId: borrower._id,
                    title,
                    message,
                    type: "emi_due_tomorrow",
                    metadata: {
                      loanId: loan._id,
                      amount,
                      dueDate,
                      lenderName,
                      screen: "Notifications",
                    },
                  });

                  await sendPushToUser(borrower._id, title, message, {
                    type: "emi_due_tomorrow",
                    loanId: loan._id.toString(),
                    amount: amount.toString(),
                    lenderName,
                    screen: "Notifications",
                  });

                  stats.dueTomorrowCount++;
                } else {
                  stats.skippedAlreadySent++;
                }
              }

              // 2. Due Today
              else if (dueDate >= todayStart && dueDate <= todayEnd) {
                const alreadySent = await Notification.findOne({
                  userId: borrower._id,
                  type: "emi_due_today",
                  "metadata.loanId": loan._id,
                  createdAt: { $gte: todayStart, $lte: todayEnd },
                });

                if (!alreadySent) {
                  const title = "Loan Payment Due Today";
                  const message = `Action Required: Your loan payment of ₹${amount.toLocaleString("en-IN")} to ${lenderName} is due today (${formatDate(dueDate)}). Please pay today to avoid overdue charges.`;

                  await saveInAppNotification({
                    userId: borrower._id,
                    title,
                    message,
                    type: "emi_due_today",
                    metadata: {
                      loanId: loan._id,
                      amount,
                      dueDate,
                      lenderName,
                      screen: "Notifications",
                    },
                  });

                  await sendPushToUser(borrower._id, title, message, {
                    type: "emi_due_today",
                    loanId: loan._id.toString(),
                    amount: amount.toString(),
                    lenderName,
                    screen: "Notifications",
                  });

                  stats.dueTodayCount++;
                } else {
                  stats.skippedAlreadySent++;
                }
              }

              // 3. Overdue / Passed
              else if (dueDate < todayStart) {
                if (loan.paymentStatus !== "overdue") {
                  loan.paymentStatus = "overdue";
                  if (!loan.overdueDetails) loan.overdueDetails = {};
                  loan.overdueDetails.isOverdue = true;
                  loan.overdueDetails.overdueAmount = amount;
                  loanModified = true;
                }

                const overdueDays = Math.max(
                  1,
                  Math.floor((todayStart.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
                );

                const alreadySent = await Notification.findOne({
                  userId: borrower._id,
                  type: "overdue_loan",
                  "metadata.loanId": loan._id,
                  createdAt: { $gte: todayStart, $lte: todayEnd },
                });

                if (!alreadySent) {
                  const title = "Loan Payment Overdue";
                  const message = `Alert: Your loan payment of ₹${amount.toLocaleString("en-IN")} to ${lenderName} was due on ${formatDate(dueDate)} and is overdue by ${overdueDays} day${overdueDays > 1 ? "s" : ""}. Please pay immediately.`;

                  await saveInAppNotification({
                    userId: borrower._id,
                    title,
                    message,
                    type: "overdue_loan",
                    metadata: {
                      loanId: loan._id,
                      amount,
                      dueDate,
                      overdueDays,
                      lenderName,
                      screen: "Notifications",
                    },
                  });

                  await sendPushToUser(borrower._id, title, message, {
                    type: "overdue_loan",
                    loanId: loan._id.toString(),
                    amount: amount.toString(),
                    overdueDays: overdueDays.toString(),
                    lenderName,
                    screen: "Notifications",
                  });

                  stats.overdueCount++;
                } else {
                  stats.skippedAlreadySent++;
                }
              }
            }
          }
        }

        if (loanModified) {
          await loan.save();
        }
      } catch (loanErr) {
        console.error(`[loanReminderService] Error checking loan ${loan._id}:`, loanErr.message);
      }
    }
  } catch (error) {
    console.error("[loanReminderService] Fatal error checking EMI reminders:", error);
  }

  return stats;
}

module.exports = {
  checkAndSendEmiPaymentReminders,
};
