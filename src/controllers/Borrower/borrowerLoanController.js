const Loan = require("../../models/Loan");
const User = require("../../models/User");
const {
  sendLoanStatusNotification,
  sendLoanUpdateNotification,
} = require("../../services/notificationService");
const paginateQuery = require("../../utils/pagination");
const razorpayInstance = require("../../config/razorpay.config");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

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
      installmentNumber, // for installment payments
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

    let paymentData = {
      amount: Number(amount), // Ensure it's a number
      paymentMode,
      paymentType,
      installmentNumber: installmentNumber ? Number(installmentNumber) : null,
      transactionId: transactionId || null,
      notes: notes || null,
      paymentDate: new Date(),
      paymentConfirmation: "pending", // Add confirmation status
    };

    // Handle payment proof upload if provided
    if (req.file) {
      try {
        // Upload to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "Loan_payment_proofs",
              resource_type: req.file.mimetype.startsWith("image/") ? "image" : "raw",
            },
            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve(result);
              }
            }
          );
          stream.end(req.file.buffer);
        });
        paymentData.paymentProof = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("Error uploading payment proof to Cloudinary:", uploadError);
        // Continue without payment proof if upload fails
        paymentData.paymentProof = null;
      }
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
    const submittedInstallments = loan.paymentHistory.filter(p => p.paymentType === 'installment').length;

    return res.status(200).json({
      message: `Payment of ₹${paymentAmount} submitted successfully. Lender confirmation required.`,
      data: {
        loanId: loan._id,
        paymentAmount: paymentAmount,
        paymentType: paymentType,
        paymentMode: paymentMode,

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
          currentInstallmentNumber: submittedInstallments,
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

      // Group payments by installment number for better display
      const installmentBreakdown = confirmedPayments.map((payment, index) => ({
        installmentNumber: index + 1,
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        confirmedAt: payment.confirmedAt
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
          paidInstallments: loan.installmentPlan?.paidInstallments || 0,
          totalInstallments: loan.installmentPlan?.totalInstallments || 1,
          installmentAmount: loan.installmentPlan?.installmentAmount || loan.amount,
          frequency: loan.installmentPlan?.installmentFrequency || null,
          nextDueDate: loan.installmentPlan?.nextDueDate || null,
          installmentBreakdown: installmentBreakdown
        },
        pendingPayments: {
          count: pendingPayments.length,
          totalAmount: pendingPayments.reduce((sum, p) => sum + p.amount, 0),
          payments: pendingPayments.map(p => ({
            amount: p.amount,
            submittedDate: p.paymentDate,
            paymentType: p.paymentType,
            paymentMode: p.paymentMode
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

    const installmentBreakdown = confirmedPayments.map((payment, index) => ({
      installmentNumber: index + 1,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      confirmedAt: payment.confirmedAt,
      paymentMode: payment.paymentMode,
      notes: payment.notes
    }));

    return res.status(200).json({
      message: "Payment history retrieved successfully",
      data: {
        loanId: loan._id,
        loanSummary: {
          totalLoanAmount: loan.amount,
          totalPaidAmount: loan.totalPaid,
          remainingAmount: loan.remainingAmount,
          paymentStatus: loan.paymentStatus,
          paymentConfirmation: loan.paymentConfirmation,
          loanType: loan.paymentType,
          paymentMode: loan.paymentMode
        },
        installmentDetails: {
          isInstallmentLoan: loan.paymentType === 'installment',
          paidInstallments: loan.installmentPlan?.paidInstallments || 0,
          totalInstallments: loan.installmentPlan?.totalInstallments || 1,
          installmentAmount: loan.installmentPlan?.installmentAmount || loan.amount,
          frequency: loan.installmentPlan?.installmentFrequency || null,
          nextDueDate: loan.installmentPlan?.nextDueDate || null,
          installmentBreakdown: installmentBreakdown
        },
        paymentHistory: {
          allPayments: loan.paymentHistory,
          confirmedPayments: confirmedPayments.length,
          pendingPayments: pendingPayments.length,
          pendingAmount: pendingPayments.reduce((sum, p) => sum + p.amount, 0)
        },
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

// Get recent activities for borrower
const getBorrowerRecentActivities = async (req, res) => {
  try {
    const userId = req.user.id; // Get the logged-in borrower ID
    const limit = parseInt(req.query.limit) || 5; // Default to 5 activities

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

    // Get borrower's Aadhaar number
    const borrower = await User.findById(userId).select('aadharCardNo');
    
    if (!borrower || !borrower.aadharCardNo) {
      return res.status(404).json({
        success: false,
        message: "Borrower profile not found or Aadhaar number missing",
      });
    }

    // Get borrower's loans (loans taken) using aadhaarNumber
    const loansTaken = await Loan.find({ aadhaarNumber: borrower.aadharCardNo })
      .sort({ updatedAt: -1 })
      .limit(limit * 2) // Get more to filter
      .select('name amount paymentStatus borrowerAcceptanceStatus updatedAt lenderId paymentHistory')
      .populate('lenderId', 'userName')
      .lean();

    // Format activities (only loans taken activities for borrowers)
    const activities = [];

    loansTaken.forEach(loan => {
      let shortMessage = '';
      let message = '';

      const lenderName = loan.lenderId?.userName || 'Lender';

      // Check for payment confirmation activities
      if (loan.paymentHistory && Array.isArray(loan.paymentHistory) && loan.paymentHistory.length > 0) {
        const recentPayment = loan.paymentHistory[loan.paymentHistory.length - 1];
        const paymentDate = new Date(recentPayment.paymentDate || recentPayment.confirmedAt || loan.updatedAt);
        const loanUpdateDate = new Date(loan.updatedAt);
        
        // If payment was updated recently (within last minute), prioritize payment status
        const timeDiff = Math.abs(loanUpdateDate - paymentDate);
        if (timeDiff < 60000 && recentPayment.paymentStatus === 'confirmed') {
          shortMessage = 'Payment Confirmed';
          message = `Your payment of ₹${recentPayment.amount} for loan from ${lenderName} has been confirmed`;
        } else if (timeDiff < 60000 && recentPayment.paymentStatus === 'rejected') {
          shortMessage = 'Payment Rejected';
          message = `Your payment of ₹${recentPayment.amount} for loan from ${lenderName} was rejected`;
        } else if (timeDiff < 60000 && recentPayment.paymentStatus === 'pending') {
          shortMessage = 'Payment Submitted';
          message = `You submitted a payment of ₹${recentPayment.amount} for loan from ${lenderName} (pending confirmation)`;
        }
      }

      // If no payment activity, check loan status
      if (!shortMessage) {
        if (loan.paymentStatus === 'paid') {
          shortMessage = 'Loan Paid';
          message = `You fully paid loan of ₹${loan.amount} from ${lenderName}`;
        } else if (loan.borrowerAcceptanceStatus === 'accepted') {
          shortMessage = 'Loan Accepted';
          message = `You accepted loan of ₹${loan.amount} from ${lenderName}`;
        } else if (loan.borrowerAcceptanceStatus === 'rejected') {
          shortMessage = 'Loan Rejected';
          message = `You rejected loan of ₹${loan.amount} from ${lenderName}`;
        } else if (loan.paymentStatus === 'pending' && loan.borrowerAcceptanceStatus === 'pending') {
          shortMessage = 'Loan Received';
          message = `You received a loan offer of ₹${loan.amount} from ${lenderName}`;
        } else if (loan.paymentStatus === 'pending' && loan.borrowerAcceptanceStatus === 'accepted') {
          shortMessage = 'Loan Active';
          message = `Your loan of ₹${loan.amount} from ${lenderName} is active`;
        } else if (loan.paymentStatus === 'part paid') {
          shortMessage = 'Loan Partially Paid';
          message = `Your loan of ₹${loan.amount} from ${lenderName} is partially paid`;
        } else if (loan.paymentStatus === 'overdue') {
          shortMessage = 'Loan Overdue';
          message = `Your loan of ₹${loan.amount} from ${lenderName} is overdue`;
        }
      }

      // Only add if we have a message
      if (shortMessage && message) {
        activities.push({
          type: 'loan_taken',
          shortMessage,
          message,
          loanId: loan._id,
          loanName: loan.name || 'Loan',
          amount: loan.amount,
          lenderName: lenderName,
          timestamp: loan.updatedAt,
          relativeTime: getRelativeTime(loan.updatedAt)
        });
      }
    });

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Take only the most recent ones based on limit
    const recentActivities = activities.slice(0, limit);

    return res.status(200).json({
      success: true,
      message: "Borrower recent activities fetched successfully",
      count: recentActivities.length,
      data: recentActivities,
    });
  } catch (error) {
    console.error("Error fetching borrower recent activities:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get borrower loan statistics with percentages for dashboard/graph
const getBorrowerStatistics = async (req, res) => {
  try {
    const borrowerId = req.user.id;

    // Get the borrower's Aadhaar number
    const borrower = await User.findById(borrowerId).select('aadharCardNo');
    
    if (!borrower || !borrower.aadharCardNo) {
      return res.status(404).json({
        success: false,
        message: "Borrower profile not found or Aadhaar number missing",
      });
    }

    // Get all loans for this borrower
    const loans = await Loan.find({ aadhaarNumber: borrower.aadharCardNo }).lean();

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
            activeLoans: 0,
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
    let activeLoansCount = 0;

    const currentDate = new Date();

    loans.forEach((loan) => {
      // Add to total loan amount
      totalLoanAmount += loan.amount || 0;

      // Calculate paid amount (from totalPaid field)
      const paidAmount = loan.totalPaid || 0;
      totalPaidAmount += paidAmount;

      // Check if loan is overdue
      // A loan is considered overdue if:
      // 1. It's already marked as overdue (by cron job), OR
      // 2. loanEndDate has passed AND there's remaining amount AND loan is confirmed/accepted
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

      // Count active loans (pending or part paid but not overdue)
      if ((loan.paymentStatus === "pending" || loan.paymentStatus === "part paid") && !isOverdue) {
        activeLoansCount++;
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
      totalRemainingAmount: parseFloat((totalLoanAmount - totalPaidAmount).toFixed(2)),
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
        activeLoans: activeLoansCount,
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

/**
 * Create Razorpay Order for Borrower Loan Payment
 * This endpoint creates a Razorpay order when borrower wants to pay loan online
 */
const createRazorpayOrderForPayment = async (req, res) => {
  try {
    const borrowerId = req.user.id;
    const { loanId } = req.params;
    const { amount, paymentType = "one-time" } = req.body;

    // Validate required fields
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Payment amount is required",
      });
    }

    if (!["one-time", "installment"].includes(paymentType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment type. Must be 'one-time' or 'installment'",
      });
    }

    // Validate amount
    const paymentAmount = Number(amount);
    if (paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be greater than 0",
      });
    }

    // Find the loan
    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    // Verify borrower owns this loan
    const borrower = await User.findById(borrowerId);
    if (!borrower || loan.aadhaarNumber !== borrower.aadharCardNo) {
      return res.status(403).json({
        success: false,
        message: "You can only create payment orders for your own loans",
        code: "FORBIDDEN",
      });
    }

    // Check if loan is already fully paid
    if (loan.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "This loan is already fully paid",
      });
    }

    // Validate payment amount doesn't exceed remaining amount
    const remainingAmount = loan.remainingAmount || (loan.amount - (loan.totalPaid || 0));
    if (paymentAmount > remainingAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (₹${paymentAmount}) cannot exceed remaining amount (₹${remainingAmount})`,
        remainingAmount: remainingAmount,
      });
    }

    // Get lender details
    const lender = await User.findById(loan.lenderId).select('userName email');

    // Create Razorpay order
    try {
      const timestamp = Date.now();
      const shortLoanId = loanId.toString().substring(18, 24);
      const shortBorrowerId = borrowerId.toString().substring(18, 24);
      const receiptId = `payment_${shortLoanId}_${shortBorrowerId}_${timestamp.toString().slice(-6)}`;

      const options = {
        amount: paymentAmount * 100, // Convert to paise
        currency: "INR",
        receipt: receiptId,
        notes: {
          borrowerId: borrowerId.toString(),
          loanId: loanId.toString(),
          lenderId: loan.lenderId.toString(),
          paymentAmount: paymentAmount.toString(),
          paymentType: paymentType,
          loanAmount: loan.amount.toString(),
          remainingAmount: remainingAmount.toString(),
          borrowerAadhaar: loan.aadhaarNumber,
          borrowerName: borrower.userName || borrower.name,
          lenderName: lender?.userName || "Lender",
        },
      };

      const razorpayOrder = await razorpayInstance.orders.create(options);

      return res.status(200).json({
        success: true,
        message: "Razorpay order created successfully",
        data: {
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount, // Amount in paise
          currency: razorpayOrder.currency,
          receipt: razorpayOrder.receipt,
          loanId: loanId,
          paymentAmount: paymentAmount,
          paymentType: paymentType,
          remainingAmount: remainingAmount,
          keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_eXyUgxz2VtmepU',
          loanDetails: {
            totalAmount: loan.amount,
            totalPaid: loan.totalPaid || 0,
            remainingAmount: remainingAmount,
            loanStatus: loan.paymentStatus,
          },
        },
      });
    } catch (razorpayError) {
      console.error("Error creating Razorpay order:", razorpayError);
      return res.status(500).json({
        success: false,
        message: "Failed to create Razorpay order. Please try again.",
        error: razorpayError.message,
      });
    }
  } catch (error) {
    console.error("Error creating Razorpay order for payment:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

/**
 * Verify Razorpay Payment for Borrower Loan Repayment
 * This endpoint verifies the Razorpay payment after borrower completes payment
 */
const verifyRazorpayPayment = async (req, res) => {
  try {
    const borrowerId = req.user.id;
    const { loanId } = req.params;
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      amount,
      paymentType = "one-time",
      notes,
    } = req.body;

    // Validate required fields
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: razorpay_payment_id, razorpay_order_id, razorpay_signature, amount",
      });
    }

    if (!["one-time", "installment"].includes(paymentType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment type. Must be 'one-time' or 'installment'",
      });
    }

    const paymentAmount = Number(amount);

    // Find the loan
    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    // Verify borrower owns this loan
    const borrower = await User.findById(borrowerId);
    if (!borrower || loan.aadhaarNumber !== borrower.aadharCardNo) {
      return res.status(403).json({
        success: false,
        message: "You can only verify payments for your own loans",
        code: "FORBIDDEN",
      });
    }

    // Check if loan is already fully paid
    if (loan.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "This loan is already fully paid",
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
        success: false,
        message: "Payment verification failed. Invalid signature.",
        error: "Signature mismatch",
      });
    }

    // Create payment entry in loan history
    const paymentData = {
      amount: paymentAmount,
      paymentMode: "online",
      paymentType: paymentType,
      transactionId: razorpay_payment_id, // Store Razorpay payment ID in transactionId
      notes: notes || `Online payment via Razorpay. Order ID: ${razorpay_order_id}. Payment ID: ${razorpay_payment_id}`,
      paymentDate: new Date(),
      paymentStatus: "pending", // Will be confirmed by lender
      // Store Razorpay details (Mongoose will accept these even if not in schema)
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    };

    // Update loan payment mode if not set
    if (!loan.paymentMode || loan.paymentMode === "cash") {
      loan.paymentMode = "online";
    }

    // Update payment type
    if (paymentType === "one-time") {
      loan.paymentType = "one-time";
    } else if (paymentType === "installment") {
      loan.paymentType = "installment";
      
      // Calculate next due date based on frequency
      if (loan.installmentPlan?.installmentFrequency === "monthly") {
        loan.installmentPlan.nextDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      } else if (loan.installmentPlan?.installmentFrequency === "weekly") {
        loan.installmentPlan.nextDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      } else if (loan.installmentPlan?.installmentFrequency === "quarterly") {
        loan.installmentPlan.nextDueDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      }
    }

    // Add payment to history
    loan.paymentHistory.push(paymentData);

    // Set payment confirmation status
    loan.paymentConfirmation = "pending";

    await loan.save();

    // Send notification to lender about pending payment confirmation
    await sendLoanUpdateNotification(loan.aadhaarNumber, loan).catch(err => {
      console.log("Notification skipped:", err.message);
    });

    // Populate loan details for response
    const updatedLoan = await Loan.findById(loan._id)
      .populate('lenderId', 'userName email mobileNo profileImage')
      .populate({
        path: 'borrowerId',
        select: 'userName email mobileNo aadharCardNo',
        strictPopulate: false
      });

    const remainingAmount = loan.remainingAmount || (loan.amount - (loan.totalPaid || 0));

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully. Payment is pending lender confirmation.",
      data: {
        loan: updatedLoan,
        paymentDetails: {
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          amount: paymentAmount,
          currency: "INR",
          paymentType: paymentType,
          paymentStatus: "pending_confirmation",
        },
        loanSummary: {
          totalLoanAmount: loan.amount,
          totalPaid: loan.totalPaid || 0,
          remainingAmount: remainingAmount - paymentAmount,
          currentPaymentAmount: paymentAmount,
        },
        nextStep: "Lender will confirm this payment. You will be notified once confirmed.",
      },
    });
  } catch (error) {
    console.error("Error verifying Razorpay payment:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

/**
 * Get Installment History for a Loan
 * Returns detailed installment history including paid, pending, and upcoming installments
 */
const getInstallmentHistory = async (req, res) => {
  try {
    const borrowerId = req.user.id;
    const { loanId } = req.params;

    // Find the loan
    const loan = await Loan.findById(loanId)
      .populate('lenderId', 'userName email mobileNo profileImage')
      .populate({
        path: 'borrowerId',
        select: 'userName email mobileNo aadharCardNo',
        strictPopulate: false
      });

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    // Verify borrower owns this loan
    const borrower = await User.findById(borrowerId);
    if (!borrower || loan.aadhaarNumber !== borrower.aadharCardNo) {
      return res.status(403).json({
        success: false,
        message: "You can only view installment history for your own loans",
        code: "FORBIDDEN",
      });
    }

    // Check if loan has installment plan
    const isInstallmentLoan = loan.paymentType === "installment" || loan.installmentPlan?.totalInstallments > 1;
    
    if (!isInstallmentLoan) {
      return res.status(400).json({
        success: false,
        message: "This loan is not an installment loan",
      });
    }

    const installmentPlan = loan.installmentPlan || {};
    const totalInstallments = installmentPlan.totalInstallments || 1;
    const installmentAmount = installmentPlan.installmentAmount || loan.amount;
    const frequency = installmentPlan.installmentFrequency || "monthly";
    const loanStartDate = loan.loanStartDate || loan.loanGivenDate || loan.createdAt;

    // Get all confirmed payments (these are the paid installments)
    const confirmedPayments = loan.paymentHistory.filter(p => p.paymentStatus === 'confirmed');
    const pendingPayments = loan.paymentHistory.filter(p => p.paymentStatus === 'pending');
    const rejectedPayments = loan.paymentHistory.filter(p => p.paymentStatus === 'rejected');

    // Filter installment payments
    const confirmedInstallments = confirmedPayments.filter(p => p.paymentType === 'installment');
    const pendingInstallments = pendingPayments.filter(p => p.paymentType === 'installment');
    const rejectedInstallments = rejectedPayments.filter(p => p.paymentType === 'installment');

    // Calculate frequency in days
    const frequencyDays = {
      weekly: 7,
      monthly: 30,
      quarterly: 90
    };
    const daysToAdd = frequencyDays[frequency] || 30;

    // Build complete installment schedule
    const installmentSchedule = [];
    const currentDate = new Date();
    let paidInstallmentsCount = 0;

    // Sort confirmed installments by payment date
    confirmedInstallments.sort((a, b) => new Date(a.confirmedAt || a.paymentDate) - new Date(b.confirmedAt || b.paymentDate));

    // Add paid installments
    confirmedInstallments.forEach((payment, index) => {
      const dueDate = calculateDueDate(loanStartDate, paidInstallmentsCount, daysToAdd);
      installmentSchedule.push({
        installmentNumber: paidInstallmentsCount + 1,
        amount: payment.amount,
        dueDate: dueDate,
        status: "paid",
        paidDate: payment.confirmedAt || payment.paymentDate,
        paymentMode: payment.paymentMode,
        transactionId: payment.transactionId,
        notes: payment.notes,
        isOnTime: new Date(payment.confirmedAt || payment.paymentDate) <= dueDate,
        paymentId: payment._id,
      });
      paidInstallmentsCount++;
    });

    // Add pending installments
    pendingInstallments.forEach((payment, index) => {
      const dueDate = calculateDueDate(loanStartDate, paidInstallmentsCount, daysToAdd);
      installmentSchedule.push({
        installmentNumber: paidInstallmentsCount + 1,
        amount: payment.amount,
        dueDate: dueDate,
        status: "pending",
        submittedDate: payment.paymentDate,
        paymentMode: payment.paymentMode,
        transactionId: payment.transactionId,
        notes: payment.notes,
        paymentId: payment._id,
      });
      paidInstallmentsCount++;
    });

    // Add rejected installments
    rejectedInstallments.forEach((payment, index) => {
      const dueDate = calculateDueDate(loanStartDate, paidInstallmentsCount, daysToAdd);
      installmentSchedule.push({
        installmentNumber: paidInstallmentsCount + 1,
        amount: payment.amount,
        dueDate: dueDate,
        status: "rejected",
        rejectedDate: payment.confirmedAt || payment.paymentDate,
        paymentMode: payment.paymentMode,
        transactionId: payment.transactionId,
        notes: payment.notes,
        rejectionReason: payment.notes,
        paymentId: payment._id,
      });
      paidInstallmentsCount++;
    });

    // Add upcoming installments (not yet paid or submitted)
    while (installmentSchedule.length < totalInstallments) {
      const installmentNumber = installmentSchedule.length + 1;
      const dueDate = calculateDueDate(loanStartDate, installmentSchedule.length, daysToAdd);
      const isOverdue = new Date(dueDate) < currentDate && installmentSchedule.length > 0;
      
      installmentSchedule.push({
        installmentNumber: installmentNumber,
        amount: installmentAmount,
        dueDate: dueDate,
        status: isOverdue ? "overdue" : "upcoming",
        isOverdue: isOverdue,
        overdueDays: isOverdue ? Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24)) : 0,
      });
    }

    // Calculate summary statistics
    const paidInstallments = installmentSchedule.filter(i => i.status === 'paid');
    const pendingInstallmentsCount = installmentSchedule.filter(i => i.status === 'pending').length;
    const overdueInstallments = installmentSchedule.filter(i => i.status === 'overdue' || (i.status === 'upcoming' && i.isOverdue));
    const upcomingInstallments = installmentSchedule.filter(i => i.status === 'upcoming' && !i.isOverdue);

    const totalPaidAmount = paidInstallments.reduce((sum, i) => sum + (i.amount || 0), 0);
    const totalPendingAmount = pendingInstallments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalOverdueAmount = overdueInstallments.reduce((sum, i) => sum + (i.amount || 0), 0);

    // Calculate on-time payment rate
    const onTimePayments = paidInstallments.filter(i => i.isOnTime).length;
    const onTimeRate = paidInstallments.length > 0 
      ? parseFloat(((onTimePayments / paidInstallments.length) * 100).toFixed(2))
      : 0;

    return res.status(200).json({
      success: true,
      message: "Installment history retrieved successfully",
      data: {
        loanId: loan._id,
        loanDetails: {
          loanName: loan.name,
          totalLoanAmount: loan.amount,
          totalPaidAmount: loan.totalPaid || 0,
          remainingAmount: loan.remainingAmount || (loan.amount - (loan.totalPaid || 0)),
          loanStatus: loan.paymentStatus,
        },
        installmentPlan: {
          totalInstallments: totalInstallments,
          paidInstallments: paidInstallments.length,
          pendingInstallments: pendingInstallmentsCount,
          overdueInstallments: overdueInstallments.length,
          upcomingInstallments: upcomingInstallments.length,
          installmentAmount: installmentAmount,
          frequency: frequency,
          nextDueDate: installmentPlan.nextDueDate || calculateDueDate(loanStartDate, paidInstallments.length, daysToAdd),
        },
        summary: {
          totalPaidAmount: totalPaidAmount,
          totalPendingAmount: totalPendingAmount,
          totalOverdueAmount: totalOverdueAmount,
          totalRemainingAmount: loan.remainingAmount || (loan.amount - (loan.totalPaid || 0)),
          onTimePayments: onTimePayments,
          totalPaidInstallments: paidInstallments.length,
          onTimePaymentRate: onTimeRate,
        },
        installmentHistory: installmentSchedule,
        lenderInfo: {
          lenderName: loan.lenderId?.userName || "Lender",
          lenderPhone: loan.lenderId?.mobileNo || "Contact lender",
          lenderEmail: loan.lenderId?.email || "Contact lender",
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving installment history:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Helper function to calculate due date for an installment
function calculateDueDate(startDate, installmentIndex, daysToAdd) {
  const start = new Date(startDate);
  const dueDate = new Date(start);
  dueDate.setDate(dueDate.getDate() + (installmentIndex * daysToAdd));
  return dueDate;
}

module.exports = {
  getLoanByAadhaar,
  updateLoanAcceptanceStatus,
  makeLoanPayment,
  getPaymentHistory,
  getMyLoans,
  getBorrowerStatistics,
  getBorrowerRecentActivities,
  createRazorpayOrderForPayment,
  verifyRazorpayPayment,
  getInstallmentHistory,
};
