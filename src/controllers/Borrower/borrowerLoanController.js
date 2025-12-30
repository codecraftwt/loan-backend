const Loan = require("../../models/Loan");
const User = require("../../models/User");
const {
  sendLoanStatusNotification,
  sendLoanUpdateNotification,
} = require("../../services/notificationService");
const paginateQuery = require("../../utils/pagination");

// Get loans by Aadhaar (borrower views their loans)
const getLoanByAadhaar = async (req, res) => {
  const {
    aadhaarNumber,
    page,
    limit,
    startDate,
    endDate,
    status,
    minAmount,
    maxAmount,
    search,
  } = req.query;

  if (!aadhaarNumber) {
    return res.status(400).json({ message: "Aadhaar number is required" });
  }

  try {
    const query = { aadhaarNumber };

    // Add filters
    if (startDate) query.loanStartDate = { $gte: new Date(startDate) };
    if (endDate)
      query.loanEndDate = { ...query.loanEndDate, $lte: new Date(endDate) };
    if (status) query.paymentStatus = status;
    if (minAmount !== undefined || maxAmount !== undefined) {
      query.amount = {};
      if (minAmount !== undefined) query.amount.$gte = Number(minAmount);
      if (maxAmount !== undefined) query.amount.$lte = Number(maxAmount);
    }

    // Create options for paginateQuery
    const options = {
      sort: { createdAt: -1 },
      populate: {
        path: "lenderId",
        select: "userName email mobileNo",
      }
    };

    // If search parameter exists, add a match query
    if (search) {
      options.populate.match = {
        $or: [
          { userName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { mobileNo: { $regex: search, $options: 'i' } }
        ]
      };
    }

    // Pagination and options
    const { data: loans, pagination } = await paginateQuery(
      Loan,
      query,
      page,
      limit,
      options
    );

    // Filter loans based on search
    let filteredLoans = loans;
    if (search) {
      filteredLoans = loans.filter(loan => {
        // Only include loans that have a lender AND match the search
        if (!loan.lenderId) return false; // Exclude loans with null lender

        // Check if lender matches search criteria
        const lender = loan.lenderId;
        const searchLower = search.toLowerCase();

        return (
          lender.userName?.toLowerCase().includes(searchLower) ||
          lender.email?.toLowerCase().includes(searchLower) ||
          lender.mobileNo?.includes(search)
        );
      });
    }

    if (filteredLoans.length === 0) {
      return res.status(404).json({ message: "No loans found" });
    }

    const pendingLoans = filteredLoans.filter(
      (loan) =>
        loan.paymentStatus === "pending" &&
        loan.borrowerAcceptanceStatus === "accepted"
    );
    const totalAmount = pendingLoans.reduce(
      (sum, loan) => sum + loan.amount,
      0
    );

    return res.status(200).json({
      message: "Loan data fetched successfully",
      totalAmount,
      data: filteredLoans,
      pagination: {
        ...pagination,
        totalDocuments: filteredLoans.length,
        totalPages: Math.ceil(filteredLoans.length / (limit || 10))
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Update loan acceptance status (borrower accepts/rejects loan)
const updateLoanAcceptanceStatus = async (req, res) => {
  const { loanId } = req.params;
  const { status } = req.body;

  // Check if the status is either "pending" or "paid"
  if (!["pending", "accepted", "rejected"].includes(status)) {
    return res.status(400).json({
      message:
        "Invalid status value. Only 'pending' or 'accepted' or 'rejected' are allowed.",
    });
  }

  try {
    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    // If loan is already confirmed via OTP, borrower acceptance is already set to "accepted"
    if (loan.loanConfirmed && loan.borrowerAcceptanceStatus === "accepted") {
      return res.status(400).json({
        message: "Loan is already confirmed and accepted via OTP verification",
      });
    }

    // Check if the loan is already in the same status
    if (loan.borrowerAcceptanceStatus === status) {
      return res.status(400).json({
        message: `Loan is already marked as '${status}'`,
      });
    }

    // Update the loan status
    loan.borrowerAcceptanceStatus = status;
    await loan.save();

    // Send notification to lender
    await sendLoanStatusNotification(loan.lenderId, loan.name, status);

    return res.status(200).json({
      message: "Loan status updated successfully",
      loan,
    });
  } catch (error) {
    console.error("Error updating loan status:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Make loan payment (borrower)
const makeLoanPayment = async (req, res) => {
  try {
    const borrowerId = req.user.id;
    const { loanId } = req.params;
    const {
      paymentMode, // "cash" or "online"
      paymentType, // "one-time" or "installment"
      amount,
      transactionId,
      notes,
    } = req.body;

    // Validate required fields
    if (!paymentMode || !paymentType || !amount) {
      return res.status(400).json({
        message: "Payment mode, payment type, and amount are required",
      });
    }

    // Validate payment mode and type
    if (!["cash", "online"].includes(paymentMode)) {
      return res.status(400).json({
        message: "Invalid payment mode. Must be 'cash' or 'online'",
      });
    }

    if (!["one-time", "installment"].includes(paymentType)) {
      return res.status(400).json({
        message: "Invalid payment type. Must be 'one-time' or 'installment'",
      });
    }

    // Find the loan
    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    // Verify borrower owns this loan
    const borrower = await User.findById(borrowerId);
    if (!borrower || loan.aadhaarNumber !== borrower.aadharCardNo) {
      return res.status(403).json({
        message: "You can only make payments for your own loans",
      });
    }

    // Check if loan is active
    if (loan.paymentStatus === "paid") {
      return res.status(400).json({
        message: "This loan is already fully paid",
      });
    }

    // Validate payment amount
    if (amount <= 0) {
      return res.status(400).json({
        message: "Payment amount must be greater than 0",
      });
    }

    // Calculate installment number for installment payments
    let installmentNumber = null;
    if (paymentType === "installment") {
      // Count confirmed installment payments to determine next installment number
      const confirmedInstallmentPayments = loan.paymentHistory.filter(
        p => p.paymentType === "installment" && p.paymentStatus === "confirmed"
      );
      installmentNumber = confirmedInstallmentPayments.length + 1;
    }

    let paymentData = {
      amount: Number(amount), // Ensure it's a number
      paymentMode,
      paymentType,
      installmentNumber: installmentNumber, // Store installment number
      transactionId: transactionId || null,
      notes: notes || null,
      paymentDate: new Date(),
      paymentConfirmation: "pending", // Add confirmation status
    };

    // Handle payment proof upload if provided
    if (req.file) {
      paymentData.paymentProof = req.file.path;
    }

    // DON'T update loan totals here - wait for lender confirmation
    // Just set payment type and mode for the loan
    if (paymentType === "one-time") {
      loan.paymentType = "one-time";
      loan.paymentMode = paymentMode;
    } else if (paymentType === "installment") {
      loan.paymentType = "installment";
      loan.paymentMode = paymentMode;

      // DON'T increment paidInstallments here - wait for lender confirmation
      // loan.installmentPlan.paidInstallments += 1;

      // Calculate next due date based on frequency
      if (loan.installmentPlan.installmentFrequency === "monthly") {
        loan.installmentPlan.nextDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      } else if (loan.installmentPlan.installmentFrequency === "weekly") {
        loan.installmentPlan.nextDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      } else if (loan.installmentPlan.installmentFrequency === "quarterly") {
        loan.installmentPlan.nextDueDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
      }
    }

    // Check for overdue status
    const currentDate = new Date();
    if (currentDate > loan.loanEndDate && loan.paymentStatus !== "paid") {
      loan.paymentStatus = "overdue";
      loan.overdueDetails.isOverdue = true;
      loan.overdueDetails.overdueAmount = loan.remainingAmount;
      loan.overdueDetails.overdueDays = Math.floor(
        (currentDate - loan.loanEndDate) / (1000 * 60 * 60 * 24)
      );
    }

    // Add payment to history
    loan.paymentHistory.push(paymentData);

    await loan.save();

    // Set payment confirmation status instead of sending notification
    loan.paymentConfirmation = "pending";

    // Calculate what totals would be after confirmation (for display only)
    const currentTotalPaid = Number(loan.totalPaid) || 0;
    const loanAmount = Number(loan.amount) || 0;
    const paymentAmount = Number(amount) || 0;

    const projectedTotalPaid = currentTotalPaid + paymentAmount;
    const projectedRemainingAmount = loanAmount - projectedTotalPaid;

    // Get installment information
    const pendingPayments = loan.paymentHistory.filter(p => p.paymentStatus === 'pending').length;
    const confirmedInstallmentPayments = loan.paymentHistory.filter(
      p => p.paymentType === 'installment' && p.paymentStatus === 'confirmed'
    ).length;

    return res.status(200).json({
      message: `Payment of ₹${paymentAmount} submitted successfully. Lender confirmation required.`,
      data: {
        loanId: loan._id,
        paymentAmount: paymentAmount,
        paymentType: paymentType,
        paymentMode: paymentMode,
        installmentNumber: installmentNumber, // Include installment number in response

        // Current loan status
        loanSummary: {
          totalLoanAmount: loanAmount,
          currentPaidAmount: currentTotalPaid,
          currentRemainingAmount: loanAmount - currentTotalPaid,
          loanStatus: loan.paymentStatus
        },

        // What will happen after confirmation
        afterConfirmation: {
          projectedPaidAmount: projectedTotalPaid,
          projectedRemainingAmount: Math.max(0, projectedRemainingAmount),
          projectedStatus: projectedRemainingAmount <= 0 ? "paid" : "part paid"
        },

        // Installment information
        installmentInfo: {
          isInstallmentPayment: paymentType === "installment",
          currentInstallmentNumber: installmentNumber, // This payment's installment number
          totalConfirmedInstallments: confirmedInstallmentPayments, // Already confirmed installments
          totalPendingPayments: pendingPayments,
          nextDueDate: loan.installmentPlan?.nextDueDate || null,
          frequency: loan.installmentPlan?.installmentFrequency || null
        },

        // Lender contact information
        lenderContact: {
          lenderName: loan.lenderId?.userName || "Your Lender",
          lenderPhone: loan.lenderId?.mobileNo || "Contact lender directly",
          message: `Please contact ${loan.lenderId?.userName || 'your lender'} at ${loan.lenderId?.mobileNo || 'their registered number'} to confirm this payment.`
        },

        paymentConfirmation: "pending",
        submittedAt: new Date(),
        paymentHistory: loan.paymentHistory[loan.paymentHistory.length - 1],
      },
    });

  } catch (error) {
    console.error("Error making loan payment:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get loans for borrower by borrower ID (no token required)
const getMyLoans = async (req, res) => {
  try {
    const { borrowerId } = req.query;
    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      status,
      minAmount,
      maxAmount,
      search,
    } = req.query;

    // Validate borrowerId is provided
    if (!borrowerId) {
      return res.status(400).json({
        message: "borrowerId is required as query parameter",
      });
    }

    // Get the borrower's Aadhaar number from their user profile
    const borrower = await User.findById(borrowerId).select('aadharCardNo');
    if (!borrower || !borrower.aadharCardNo) {
      return res.status(404).json({ message: "Borrower profile not found or Aadhaar number missing" });
    }

    const query = { aadhaarNumber: borrower.aadharCardNo };

    // Add filters
    if (startDate) query.loanStartDate = { $gte: new Date(startDate) };
    if (endDate)
      query.loanEndDate = { ...query.loanEndDate, $lte: new Date(endDate) };
    if (status) query.paymentStatus = status;
    if (minAmount !== undefined || maxAmount !== undefined) {
      query.amount = {};
      if (minAmount !== undefined) query.amount.$gte = Number(minAmount);
      if (maxAmount !== undefined) query.amount.$lte = Number(maxAmount);
    }

    // Add name search if provided
    if (search) {
      query.name = { $regex: search, $options: 'i' }; // Case-insensitive search
    }

    const options = {
      sort: { createdAt: -1 },
      populate: {
        path: "lenderId",
        select: "userName email mobileNo profileImage",
      }
    };

    // Pagination and options
    const { data: loans, pagination } = await paginateQuery(
      Loan,
      query,
      page,
      limit,
      options
    );

    // Filter loans based on search (if search parameter exists)
    let filteredLoans = loans;
    if (search) {
      filteredLoans = loans.filter(loan => {
        // Only include loans that have a lender AND match the search
        if (!loan.lenderId) return false;

        // Check if lender matches search criteria
        const lender = loan.lenderId;
        const searchLower = search.toLowerCase();

        return (
          lender.userName?.toLowerCase().includes(searchLower) ||
          lender.email?.toLowerCase().includes(searchLower) ||
          lender.mobileNo?.includes(search)
        );
      });
    }

    // Calculate summary statistics
    const totalLoans = filteredLoans.length;
    const activeLoans = filteredLoans.filter(loan => loan.paymentStatus === 'part paid' || loan.paymentStatus === 'pending').length;
    const completedLoans = filteredLoans.filter(loan => loan.paymentStatus === 'paid').length;
    const overdueLoans = filteredLoans.filter(loan => loan.paymentStatus === 'overdue').length;
    const totalAmountBorrowed = filteredLoans.reduce((sum, loan) => sum + loan.amount, 0);
    const totalAmountPaid = filteredLoans.reduce((sum, loan) => sum + loan.totalPaid, 0);
    const totalAmountRemaining = filteredLoans.reduce((sum, loan) => sum + loan.remainingAmount, 0);

    // Enhance loan data with better installment and payment information
    const enhancedLoans = filteredLoans.map(loan => {
      const pendingPayments = loan.paymentHistory.filter(p => p.paymentStatus === 'pending');
      const confirmedPayments = loan.paymentHistory.filter(p => p.paymentStatus === 'confirmed');

      // Group installment payments by installment number for better display
      const confirmedInstallmentPayments = loan.paymentHistory.filter(
        p => p.paymentType === 'installment' && p.paymentStatus === 'confirmed'
      );
      
      const installmentBreakdown = confirmedInstallmentPayments
        .sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0))
        .map((payment) => ({
          installmentNumber: payment.installmentNumber || null,
          amount: payment.amount,
          paymentDate: payment.paymentDate,
          confirmedAt: payment.confirmedAt,
          paymentMode: payment.paymentMode,
          notes: payment.notes
        }));

      return {
        ...loan.toObject(),
        paymentSummary: {
          totalLoanAmount: loan.amount,
          totalPaidAmount: loan.totalPaid,
          remainingAmount: loan.remainingAmount,
          paymentStatus: loan.paymentStatus,
          paymentConfirmation: loan.paymentConfirmation
        },
        installmentDetails: {
          isInstallmentLoan: loan.paymentType === 'installment',
          paidInstallments: confirmedInstallmentPayments.length, // Count of confirmed installment payments
          totalInstallments: loan.installmentPlan?.totalInstallments || 1,
          installmentAmount: loan.installmentPlan?.installmentAmount || loan.amount,
          frequency: loan.installmentPlan?.installmentFrequency || null,
          nextDueDate: loan.installmentPlan?.nextDueDate || null,
          installmentBreakdown: installmentBreakdown // Shows all installments with their numbers
        },
        pendingPayments: {
          count: pendingPayments.length,
          totalAmount: pendingPayments.reduce((sum, p) => sum + p.amount, 0),
          payments: pendingPayments.map(p => ({
            amount: p.amount,
            submittedDate: p.paymentDate,
            paymentType: p.paymentType,
            paymentMode: p.paymentMode,
            installmentNumber: p.installmentNumber || null, // Include installment number
            installmentLabel: p.paymentType === 'installment' && p.installmentNumber 
              ? `Installment ${p.installmentNumber}` 
              : null
          }))
        }
      };
    });

    return res.status(200).json({
      message: "Borrower loans retrieved successfully",
      data: enhancedLoans,
      summary: {
        totalLoans,
        activeLoans,
        completedLoans,
        overdueLoans,
        totalAmountBorrowed,
        totalAmountPaid,
        totalAmountRemaining,
      },
      pagination: {
        ...pagination,
        totalDocuments: filteredLoans.length,
        totalPages: Math.ceil(filteredLoans.length / (limit || 10))
      },
    });

  } catch (error) {
    console.error("Error retrieving borrower loans:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get payment history for a loan (no authentication required)
const getPaymentHistory = async (req, res) => {
  try {
    const { borrowerId } = req.query;
    const { loanId } = req.params;

    // Validate borrowerId
    if (!borrowerId) {
      return res.status(400).json({
        message: "borrowerId is required as query parameter",
      });
    }

    // Find the loan
    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    // Verify borrower owns this loan
    const borrower = await User.findById(borrowerId);
    if (!borrower || loan.aadhaarNumber !== borrower.aadharCardNo) {
      return res.status(403).json({
        message: "You can only view payment history for your own loans",
      });
    }

    // Enhance payment history with installment information
    const confirmedPayments = loan.paymentHistory.filter(p => p.paymentStatus === 'confirmed');
    const pendingPayments = loan.paymentHistory.filter(p => p.paymentStatus === 'pending');
    const confirmedInstallmentPayments = loan.paymentHistory.filter(
      p => p.paymentType === 'installment' && p.paymentStatus === 'confirmed'
    );

    // Create installment breakdown - use stored installmentNumber from payment records
    const installmentBreakdown = confirmedInstallmentPayments
      .sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0))
      .map((payment) => ({
        installmentNumber: payment.installmentNumber || null,
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        confirmedAt: payment.confirmedAt,
        paymentMode: payment.paymentMode,
        notes: payment.notes,
        transactionId: payment.transactionId,
        paymentProof: payment.paymentProof
      }));

    return res.status(200).json({
      message: "Payment history retrieved successfully",
      data: {
        loanId: loan._id,
        loanSummary: {
          totalLoanAmount: loan.amount,
          totalPaid: loan.totalPaid,
          remainingAmount: loan.remainingAmount,
          paymentStatus: loan.paymentStatus, // "pending", "part paid", "paid", "overdue"
          paymentType: loan.paymentType, // "one-time" or "installment"
          paymentMode: loan.paymentMode // "cash" or "online"
        },
        // Installment Details (only for installment loans)
        installmentDetails: loan.paymentType === 'installment' ? {
          totalInstallmentsPaid: confirmedInstallmentPayments.length, // How many installments have been paid
          nextDueDate: loan.installmentPlan?.nextDueDate || null,
          frequency: loan.installmentPlan?.installmentFrequency || null, // "weekly", "monthly", "quarterly"
          paidInstallments: installmentBreakdown // Detailed list of all paid installments with amounts and dates
        } : null,
        // All Payment Records
        payments: loan.paymentHistory.map(payment => ({
          _id: payment._id,
          amount: payment.amount,
          paymentDate: payment.paymentDate,
          paymentMode: payment.paymentMode,
          paymentStatus: payment.paymentStatus, // "pending", "confirmed", "rejected"
          confirmedAt: payment.confirmedAt,
          notes: payment.notes,
          transactionId: payment.transactionId,
          // For installment payments only
          installmentNumber: payment.installmentNumber || null,
          installmentLabel: payment.paymentType === 'installment' && payment.installmentNumber 
            ? `Installment ${payment.installmentNumber}` 
            : null
        })),
        // Payment Statistics
        paymentStats: {
          totalPayments: loan.paymentHistory.length,
          confirmedPayments: confirmedPayments.length,
          pendingPayments: pendingPayments.length,
          pendingAmount: pendingPayments.reduce((sum, p) => sum + p.amount, 0)
        },
        // Lender Contact Information
        lenderInfo: {
          lenderName: loan.lenderId?.userName || "Lender",
          lenderPhone: loan.lenderId?.mobileNo || "Contact lender",
          lenderEmail: loan.lenderId?.email || "Contact lender"
        },
        overdueDetails: loan.overdueDetails,
      },
    });

  } catch (error) {
    console.error("Error retrieving payment history:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

module.exports = {
  getLoanByAadhaar,
  updateLoanAcceptanceStatus,
  makeLoanPayment,
  getPaymentHistory,
  getMyLoans,
};




