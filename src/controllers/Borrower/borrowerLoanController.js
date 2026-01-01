const Loan = require("../../models/Loan");
const User = require("../../models/User");
const {
  sendLoanStatusNotification,
  sendLoanUpdateNotification,
} = require("../../services/notificationService");
const paginateQuery = require("../../utils/pagination");
const razorpayInstance = require("../../config/razorpay.config");
const crypto = require("crypto");

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

// Get borrower loan statistics with percentages for dashboard/graph
const getBorrowerLoanStatistics = async (req, res) => {
  try {
    const borrowerId = req.user.id;

    // Get borrower's Aadhaar number
    const borrower = await User.findById(borrowerId).select('aadharCardNo');
    if (!borrower || !borrower.aadharCardNo) {
      return res.status(404).json({
        success: false,
        message: "Borrower profile not found or Aadhaar number missing",
      });
    }

    // Get all loans for this borrower (where borrower has accepted)
    const loans = await Loan.find({ 
      aadhaarNumber: borrower.aadharCardNo,
      borrowerAcceptanceStatus: "accepted"
    }).lean();

    if (!loans || loans.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No loans found for this borrower",
        data: {
          totalLoanAmount: 0,
          totalPaidAmount: 0,
          totalOverdueAmount: 0,
          totalPendingAmount: 0,
          percentages: {
            totalLoanAmountPercentage: 0,
            paidPercentage: 0,
            overduePercentage: 0,
            pendingPercentage: 0,
          },
          counts: {
            totalLoans: 0,
            paidLoans: 0,
            overdueLoans: 0,
            pendingLoans: 0,
          },
        },
      });
    }

    // Calculate totals
    let totalLoanAmount = 0;
    let totalPaidAmount = 0;
    let totalOverdueAmount = 0;
    let totalPendingAmount = 0;

    // Count loans by status
    let paidLoansCount = 0;
    let overdueLoansCount = 0;
    let pendingLoansCount = 0;

    loans.forEach((loan) => {
      // Add to total loan amount
      totalLoanAmount += loan.amount || 0;

      // Calculate paid amount (from totalPaid field)
      const paidAmount = loan.totalPaid || 0;
      totalPaidAmount += paidAmount;

      // Check if loan is overdue
      const currentDate = new Date();
      const loanEndDate = loan.loanEndDate ? new Date(loan.loanEndDate) : null;
      const remainingAmount = loan.remainingAmount || 0;
      const isLoanConfirmed = loan.loanConfirmed === true || loan.otpVerified === "verified";
      const isAccepted = loan.borrowerAcceptanceStatus === "accepted";
      
      const isOverdue = 
        loan.paymentStatus === "overdue" || 
        (loan.overdueDetails && loan.overdueDetails.isOverdue === true) ||
        (
          loanEndDate && 
          loanEndDate < currentDate && 
          remainingAmount > 0 && 
          loan.paymentStatus !== "paid" &&
          isLoanConfirmed &&
          isAccepted
        );

      if (isOverdue) {
        // Use overdueAmount if available, otherwise use remainingAmount
        const overdueAmount = loan.overdueDetails?.overdueAmount || remainingAmount || 0;
        totalOverdueAmount += overdueAmount > 0 ? overdueAmount : 0;
        overdueLoansCount++;
      }

      // Check if loan is pending (not paid and not overdue)
      const isPending = 
        (loan.paymentStatus === "pending" || loan.paymentStatus === "part paid") &&
        !isOverdue &&
        (loan.remainingAmount > 0 || (loan.totalPaid || 0) < (loan.amount || 0));

      if (isPending) {
        const pendingAmount = loan.remainingAmount || ((loan.amount || 0) - (loan.totalPaid || 0));
        totalPendingAmount += pendingAmount > 0 ? pendingAmount : 0;
        pendingLoansCount++;
      }

      // Count paid loans (fully paid)
      if (loan.paymentStatus === "paid" || (loan.remainingAmount === 0 && (loan.totalPaid || 0) >= (loan.amount || 0))) {
        paidLoansCount++;
      }
    });

    // Calculate percentages (based on total loan amount)
    const totalLoanAmountPercentage = 100.00; // Total loan amount is always 100% (base reference)
    const paidPercentage = totalLoanAmount > 0 
      ? parseFloat(((totalPaidAmount / totalLoanAmount) * 100).toFixed(2))
      : 0;
    
    const overduePercentage = totalLoanAmount > 0
      ? parseFloat(((totalOverdueAmount / totalLoanAmount) * 100).toFixed(2))
      : 0;
    
    const pendingPercentage = totalLoanAmount > 0
      ? parseFloat(((totalPendingAmount / totalLoanAmount) * 100).toFixed(2))
      : 0;

    // Prepare response data
    const responseData = {
      totalLoanAmount: parseFloat(totalLoanAmount.toFixed(2)),
      totalPaidAmount: parseFloat(totalPaidAmount.toFixed(2)),
      totalOverdueAmount: parseFloat(totalOverdueAmount.toFixed(2)),
      totalPendingAmount: parseFloat(totalPendingAmount.toFixed(2)),
      percentages: {
        totalLoanAmountPercentage,
        paidPercentage,
        overduePercentage,
        pendingPercentage,
      },
      counts: {
        totalLoans: loans.length,
        paidLoans: paidLoansCount,
        overdueLoans: overdueLoansCount,
        pendingLoans: pendingLoansCount,
      },
    };

    return res.status(200).json({
      success: true,
      message: "Borrower loan statistics fetched successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Error fetching borrower loan statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get recent activities for borrower
const getRecentActivities = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    // Get borrower's Aadhaar number
    const borrower = await User.findById(userId).select('aadharCardNo');
    if (!borrower || !borrower.aadharCardNo) {
      return res.status(404).json({
        success: false,
        message: "Borrower profile not found or Aadhaar number missing",
      });
    }

    // Helper function to format relative time
    const getRelativeTime = (timestamp) => {
      const now = new Date();
      const past = new Date(timestamp);
      const diffInSeconds = Math.floor((now - past) / 1000);

      if (diffInSeconds < 60) {
        return `${diffInSeconds} second${diffInSeconds !== 1 ? 's' : ''} ago`;
      }

      const diffInMinutes = Math.floor(diffInSeconds / 60);
      if (diffInMinutes < 60) {
        return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`;
      }

      const diffInHours = Math.floor(diffInMinutes / 60);
      if (diffInHours < 24) {
        return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`;
      }

      const diffInDays = Math.floor(diffInHours / 24);
      if (diffInDays < 30) {
        return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`;
      }

      const diffInMonths = Math.floor(diffInDays / 30);
      if (diffInMonths < 12) {
        return `${diffInMonths} month${diffInMonths !== 1 ? 's' : ''} ago`;
      }

      const diffInYears = Math.floor(diffInMonths / 12);
      return `${diffInYears} year${diffInYears !== 1 ? 's' : ''} ago`;
    };

    const activities = [];
    const now = new Date();

    // 1. Get loans taken by borrower (loans received from lenders)
    const loansTaken = await Loan.find({ aadhaarNumber: borrower.aadharCardNo })
      .sort({ createdAt: -1 })
      .limit(limit * 2)
      .populate('lenderId', 'userName')
      .select('name amount lenderId borrowerAcceptanceStatus createdAt')
      .lean();

    loansTaken.forEach(loan => {
      const lenderName = loan.lenderId?.userName || 'Lender';
      activities.push({
        type: 'loan_received',
        shortMessage: 'Loan Received',
        message: `You received a loan of ₹${loan.amount} from ${lenderName}`,
        loanId: loan._id,
        loanName: loan.name,
        lenderName: lenderName,
        lenderId: loan.lenderId?._id,
        amount: loan.amount,
        timestamp: loan.createdAt,
        relativeTime: getRelativeTime(loan.createdAt)
      });
    });

    // 2. Get loans where borrower made payments
    const loansWithPayments = await Loan.find({ aadhaarNumber: borrower.aadharCardNo })
      .sort({ updatedAt: -1 })
      .limit(limit * 3)
      .populate('lenderId', 'userName')
      .select('name amount paymentHistory totalPaid paymentStatus lenderId updatedAt')
      .lean();

    loansWithPayments.forEach(loan => {
      const lenderName = loan.lenderId?.userName || 'Lender';
      
      if (loan.paymentHistory && loan.paymentHistory.length > 0) {
        // Get most recent payment
        const recentPayment = loan.paymentHistory[loan.paymentHistory.length - 1];
        if (recentPayment.paymentStatus === 'confirmed') {
          activities.push({
            type: 'payment_made',
            shortMessage: 'Payment Made',
            message: `You paid ₹${recentPayment.amount} to ${lenderName}`,
            loanId: loan._id,
            loanName: loan.name,
            lenderName: lenderName,
            amount: recentPayment.amount,
            paymentMode: recentPayment.paymentMode,
            paymentType: recentPayment.paymentType,
            timestamp: recentPayment.confirmedAt || recentPayment.paymentDate,
            relativeTime: getRelativeTime(recentPayment.confirmedAt || recentPayment.paymentDate)
          });
        }
      }

      // Check if loan is fully paid
      if (loan.paymentStatus === 'paid') {
        activities.push({
          type: 'loan_paid',
          shortMessage: 'Loan Fully Paid',
          message: `You fully paid the loan of ₹${loan.amount} to ${lenderName}`,
          loanId: loan._id,
          loanName: loan.name,
          lenderName: lenderName,
          amount: loan.amount,
          timestamp: loan.updatedAt,
          relativeTime: getRelativeTime(loan.updatedAt)
        });
      }
    });

    // 3. Get overdue loans
    const overdueLoans = await Loan.find({
      aadhaarNumber: borrower.aadharCardNo,
      'overdueDetails.isOverdue': true
    })
      .sort({ 'overdueDetails.lastOverdueCheck': -1 })
      .limit(limit)
      .populate('lenderId', 'userName')
      .select('name amount overdueDetails lenderId updatedAt')
      .lean();

    overdueLoans.forEach(loan => {
      const lenderName = loan.lenderId?.userName || 'Lender';
      activities.push({
        type: 'loan_overdue',
        shortMessage: 'Loan Overdue',
        message: `Your loan of ₹${loan.amount} from ${lenderName} is overdue by ${loan.overdueDetails.overdueDays} days`,
        loanId: loan._id,
        loanName: loan.name,
        lenderName: lenderName,
        amount: loan.amount,
        overdueAmount: loan.overdueDetails.overdueAmount,
        overdueDays: loan.overdueDetails.overdueDays,
        timestamp: loan.overdueDetails.lastOverdueCheck || loan.updatedAt,
        relativeTime: getRelativeTime(loan.overdueDetails.lastOverdueCheck || loan.updatedAt)
      });
    });

    // 4. Get loans accepted/rejected by borrower
    const loansStatusUpdates = await Loan.find({
      aadhaarNumber: borrower.aadharCardNo,
      borrowerAcceptanceStatus: { $in: ['accepted', 'rejected'] }
    })
      .sort({ updatedAt: -1 })
      .limit(limit * 2)
      .populate('lenderId', 'userName')
      .select('name amount borrowerAcceptanceStatus lenderId updatedAt')
      .lean();

    loansStatusUpdates.forEach(loan => {
      const lenderName = loan.lenderId?.userName || 'Lender';
      if (loan.borrowerAcceptanceStatus === 'accepted') {
        activities.push({
          type: 'loan_accepted',
          shortMessage: 'Loan Accepted',
          message: `You accepted loan of ₹${loan.amount} from ${lenderName}`,
          loanId: loan._id,
          loanName: loan.name,
          lenderName: lenderName,
          amount: loan.amount,
          timestamp: loan.updatedAt,
          relativeTime: getRelativeTime(loan.updatedAt)
        });
      } else if (loan.borrowerAcceptanceStatus === 'rejected') {
        activities.push({
          type: 'loan_rejected',
          shortMessage: 'Loan Rejected',
          message: `You rejected loan of ₹${loan.amount} from ${lenderName}`,
          loanId: loan._id,
          loanName: loan.name,
          lenderName: lenderName,
          amount: loan.amount,
          timestamp: loan.updatedAt,
          relativeTime: getRelativeTime(loan.updatedAt)
        });
      }
    });

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Remove duplicates and take only the most recent ones
    const uniqueActivities = [];
    const seenKeys = new Set();
    
    for (const activity of activities) {
      const key = `${activity.type}_${activity.loanId}_${activity.timestamp}`;
      if (!seenKeys.has(key) && uniqueActivities.length < limit) {
        seenKeys.add(key);
        uniqueActivities.push(activity);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Recent activities fetched successfully",
      count: uniqueActivities.length,
      data: uniqueActivities,
    });
  } catch (error) {
    console.error("Error fetching recent activities:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Create Razorpay order for loan repayment
const createLoanRepaymentOrder = async (req, res) => {
  try {
    const borrowerId = req.user.id;
    const { loanId } = req.params;
    const { paymentType, amount } = req.body; // paymentType: "one-time" or "installment"

    // Validate required fields
    if (!paymentType || !amount) {
      return res.status(400).json({
        message: "Payment type and amount are required",
      });
    }

    // Validate payment type
    if (!["one-time", "installment"].includes(paymentType)) {
      return res.status(400).json({
        message: "Invalid payment type. Must be 'one-time' or 'installment'",
      });
    }

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({
        message: "Payment amount must be greater than 0",
      });
    }

    // Find the loan
    const loan = await Loan.findById(loanId).populate("lenderId", "userName email mobileNo");
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

    // Validate payment amount doesn't exceed remaining amount
    const remainingAmount = loan.remainingAmount || loan.amount;
    if (Number(amount) > remainingAmount) {
      return res.status(400).json({
        message: `Payment amount (₹${amount}) cannot exceed remaining amount (₹${remainingAmount})`,
      });
    }

    // Create Razorpay order
    const timestamp = Date.now();
    const shortLoanId = loanId.toString().substring(18, 24);
    const shortBorrowerId = borrowerId.toString().substring(18, 24);
    const receiptId = `loan_${shortLoanId}_${shortBorrowerId}_${timestamp.toString().slice(-6)}`;

    const options = {
      amount: Math.round(Number(amount) * 100), // Convert to paise (Razorpay expects amount in smallest currency unit)
      currency: "INR",
      receipt: receiptId,
      notes: {
        loanId: loanId.toString(),
        borrowerId: borrowerId.toString(),
        lenderId: loan.lenderId._id.toString(),
        paymentType: paymentType,
        loanName: loan.name,
        borrowerName: borrower.userName,
        borrowerEmail: borrower.email,
        borrowerMobile: borrower.mobileNo,
      },
    };

    const order = await razorpayInstance.orders.create(options);

    return res.status(200).json({
      success: true,
      message: "Razorpay order created successfully",
      data: {
        orderId: order.id,
        amount: order.amount,
        amountInRupees: Number(amount),
        currency: order.currency,
        receipt: order.receipt,
        loan: {
          id: loan._id,
          name: loan.name,
          totalAmount: loan.amount,
          remainingAmount: loan.remainingAmount || loan.amount,
          paymentStatus: loan.paymentStatus,
        },
        paymentType: paymentType,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_eXyUgxz2VtmepU', // Send key ID for frontend
      },
    });
  } catch (error) {
    console.error("Error creating Razorpay order for loan repayment:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Verify Razorpay payment and process loan repayment
const verifyRazorpayPaymentAndRepay = async (req, res) => {
  try {
    const borrowerId = req.user.id;
    const { loanId } = req.params;
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      paymentType, // "one-time" or "installment"
      notes,
    } = req.body;

    // Validate required fields
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !paymentType) {
      return res.status(400).json({
        message: "Missing required fields: razorpay_payment_id, razorpay_order_id, razorpay_signature, paymentType",
      });
    }

    // Validate payment type
    if (!["one-time", "installment"].includes(paymentType)) {
      return res.status(400).json({
        message: "Invalid payment type. Must be 'one-time' or 'installment'",
      });
    }

    // Verify Razorpay signature
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || 'IOULEZFaWRNrL92MNqF5eDr0';
    const signatureString = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", razorpaySecret)
      .update(signatureString)
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      console.error("Payment signature verification failed:");
      console.error("Order ID:", razorpay_order_id);
      console.error("Payment ID:", razorpay_payment_id);
      console.error("Expected Signature:", expectedSignature);
      console.error("Received Signature:", razorpay_signature);

      return res.status(400).json({
        message: "Payment verification failed. Invalid signature.",
        error: "Signature mismatch",
      });
    }

    // Fetch payment details from Razorpay to verify amount and status
    let paymentDetails;
    try {
      paymentDetails = await razorpayInstance.payments.fetch(razorpay_payment_id);
    } catch (error) {
      console.error("Error fetching payment details from Razorpay:", error);
      return res.status(400).json({
        message: "Error fetching payment details from Razorpay",
        error: error.message,
      });
    }

    // Verify payment status
    if (paymentDetails.status !== "captured" && paymentDetails.status !== "authorized") {
      return res.status(400).json({
        message: `Payment not successful. Status: ${paymentDetails.status}`,
      });
    }

    // Find the loan
    const loan = await Loan.findById(loanId).populate("lenderId", "userName email mobileNo");
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

    // Check if loan is already fully paid
    if (loan.paymentStatus === "paid") {
      return res.status(400).json({
        message: "This loan is already fully paid",
      });
    }

    // Get payment amount from Razorpay (convert from paise to rupees)
    const paymentAmount = paymentDetails.amount / 100;

    // Validate payment amount doesn't exceed remaining amount
    const remainingAmount = loan.remainingAmount || loan.amount;
    if (paymentAmount > remainingAmount) {
      return res.status(400).json({
        message: `Payment amount (₹${paymentAmount}) cannot exceed remaining amount (₹${remainingAmount})`,
      });
    }

    // Calculate installment number for installment payments
    let installmentNumber = null;
    if (paymentType === "installment") {
      const confirmedInstallmentPayments = loan.paymentHistory.filter(
        (p) => p.paymentType === "installment" && p.paymentStatus === "confirmed"
      );
      installmentNumber = confirmedInstallmentPayments.length + 1;
    }

    // Create payment data (status: pending - requires lender confirmation)
    const paymentData = {
      amount: paymentAmount,
      paymentMode: "online",
      paymentType: paymentType,
      installmentNumber: installmentNumber,
      transactionId: razorpay_payment_id, // Store Razorpay payment ID
      notes: notes || `Razorpay payment verified - Order: ${razorpay_order_id}. Awaiting lender confirmation.`,
      paymentDate: new Date(),
      paymentStatus: "pending", // Requires lender confirmation (same as cash payments)
      confirmedBy: null, // Will be set when lender confirms
      confirmedAt: null, // Will be set when lender confirms
    };

    // Update loan payment type and mode (but don't update totals yet - wait for lender confirmation)
    if (paymentType === "one-time") {
      loan.paymentType = "one-time";
      loan.paymentMode = "online";
    } else if (paymentType === "installment") {
      loan.paymentType = "installment";
      loan.paymentMode = "online";

      // DON'T update nextDueDate here - wait for lender confirmation
      // Calculate next due date will be done when lender confirms
    }

    // DON'T update loan totals here - wait for lender confirmation
    // Just add payment to history with pending status

    // Add payment to history
    loan.paymentHistory.push(paymentData);

    // Set payment confirmation status to pending
    loan.paymentConfirmation = "pending";

    await loan.save();

    // Send notification to lender about pending payment
    await sendLoanUpdateNotification(
      loan.lenderId._id,
      loan.name,
      `Online payment of ₹${paymentAmount} received via Razorpay. Please confirm the payment.`
    );

    // Calculate what totals would be after confirmation (for display only)
    const currentTotalPaid = Number(loan.totalPaid) || 0;
    const loanAmount = Number(loan.amount) || 0;
    const projectedTotalPaid = currentTotalPaid + paymentAmount;
    const projectedRemainingAmount = loanAmount - projectedTotalPaid;

    // Get installment information
    const pendingPayments = loan.paymentHistory.filter(p => p.paymentStatus === 'pending').length;
    const confirmedInstallmentPayments = loan.paymentHistory.filter(
      p => p.paymentType === 'installment' && p.paymentStatus === 'confirmed'
    ).length;

    return res.status(200).json({
      success: true,
      message: `Payment of ₹${paymentAmount} verified successfully via Razorpay. Lender confirmation required.`,
      data: {
        loanId: loan._id,
        paymentAmount: paymentAmount,
        paymentType: paymentType,
        paymentMode: "online",
        installmentNumber: installmentNumber,
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        paymentStatus: "pending",
        lenderConfirmationStatus: "pending", // Clear status for frontend
        lenderConfirmationMessage: "Lender confirmation pending",

        // Current loan status (before confirmation)
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
          currentInstallmentNumber: installmentNumber,
          totalConfirmedInstallments: confirmedInstallmentPayments,
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
    console.error("Error verifying Razorpay payment and processing loan repayment:", error);
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
  getBorrowerLoanStatistics,
  getRecentActivities,
  createLoanRepaymentOrder,
  verifyRazorpayPaymentAndRepay,
};




