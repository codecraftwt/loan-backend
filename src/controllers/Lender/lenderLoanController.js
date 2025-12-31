const Loan = require("../../models/Loan");
const User = require("../../models/User");
const {
  sendLoanStatusNotification,
  sendLoanUpdateNotification,
  sendFraudAlertNotification,
} = require("../../services/notificationService");
const paginateQuery = require("../../utils/pagination");
const { generateLoanAgreement } = require("../../services/agreementService");
const { getFraudDetails, updateBorrowerFraudStatus } = require("../../services/fraudDetectionService");

const createLoan = async (req, res) => {
  try {
    const lenderId = req.user.id;
    const LoanData = req.body;

    // Validate required fields
    const requiredFields = ['name', 'aadharCardNo', 'mobileNumber', 'address', 'amount', 'purpose', 'loanGivenDate', 'loanEndDate', 'loanMode'];
    const missingFields = requiredFields.filter(field => !LoanData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        missingFields,
      });
    }

    // Validate loanMode
    if (!['cash', 'online'].includes(LoanData.loanMode)) {
      return res.status(400).json({
        success: false,
        message: "loanMode must be either 'cash' or 'online'",
      });
    }

    // First, find the lender (current user)
    const lender = await User.findById(lenderId);

    if (!lender) {
      return res.status(404).json({
        success: false,
        message: "Lender not found",
      });
    }

    // Check if the lender is trying to give loan to themselves
    if (lender.aadharCardNo === LoanData.aadharCardNo) {
      return res.status(400).json({
        message: "You cannot give a loan to yourself",
      });
    }

    // Find the borrower by Aadhaar number and verify they are a borrower
    const borrower = await User.findOne({
      aadharCardNo: LoanData.aadharCardNo,
      roleId: 2,
    });

    if (!borrower) {
      return res.status(404).json({
        success: false,
        message: "Borrower with the provided Aadhar number does not exist or is not a borrower",
      });
    }

    // Check for fraud before creating loan
    let fraudDetails = null;
    try {
      fraudDetails = await getFraudDetails(LoanData.aadharCardNo);
      
      // Update borrower fraud status
      await updateBorrowerFraudStatus(borrower._id, LoanData.aadharCardNo);
      
      // Send fraud alert notification if medium risk or higher
      if (fraudDetails.riskLevel !== "low") {
        await sendFraudAlertNotification(
          lenderId,
          {
            fraudScore: fraudDetails.fraudScore,
            riskLevel: fraudDetails.riskLevel,
            totalOverdueLoans: fraudDetails.flags.totalOverdueLoans,
            totalPendingLoans: fraudDetails.flags.totalPendingLoans,
          },
          LoanData.name
        ).catch(err => console.error("Error sending fraud alert:", err));
      }
    } catch (fraudError) {
      console.error("Error checking fraud:", fraudError);
      // Continue with loan creation even if fraud check fails
    }

    // Verify loan belongs to the authenticated lender
    // (This check is implicit since lenderId comes from req.user.id)

    // Generate OTP (static for now - 1234)
    const otp = "1234";
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // Create loan with OTP (not confirmed yet)
    const newLoan = new Loan({
      name: LoanData.name,
      aadhaarNumber: LoanData.aadharCardNo,
      mobileNumber: LoanData.mobileNumber,
      address: LoanData.address,
      amount: LoanData.amount,
      purpose: LoanData.purpose,
      loanStartDate: new Date(LoanData.loanGivenDate), // Set loanStartDate from loanGivenDate
      loanEndDate: new Date(LoanData.loanEndDate),
      loanMode: LoanData.loanMode,
      lenderId,
      borrowerId: borrower._id,
      otp: otp,
      otpExpiry: otpExpiry,
      loanConfirmed: false, // Will be true after OTP verification
      paymentStatus: "pending", // Status remains "pending" until OTP is verified and beyond
      borrowerAcceptanceStatus: "pending", // For borrower to accept/reject loan
    });

    const agreementText = generateLoanAgreement(newLoan);
    newLoan.agreement = agreementText;

    await newLoan.save();

    // Send notification (non-blocking - won't throw error if no device tokens)
    sendLoanUpdateNotification(LoanData.aadharCardNo, LoanData).catch(err => {
    });

    // Populate lender details for response
    const populatedLoan = await Loan.findById(newLoan._id)
      .populate('lenderId', 'userName email mobileNo profileImage');

    const response = {
      success: true,
      message: "Loan created successfully. OTP sent to borrower's mobile number.",
      data: {
        ...populatedLoan.toObject(),
        otp: otp, // Return OTP in response for testing (remove in production)
        otpMessage: "Use this OTP to confirm the loan. OTP is valid for 10 minutes.",
      },
    };

    // Add fraud warning if detected
    if (fraudDetails && fraudDetails.riskLevel !== "low") {
      response.warning = {
        fraudDetected: true,
        fraudScore: fraudDetails.fraudScore,
        riskLevel: fraudDetails.riskLevel,
        details: {
          activeLoans: fraudDetails.flags.totalActiveLoans,
          pendingLoans: fraudDetails.flags.totalPendingLoans,
          overdueLoans: fraudDetails.flags.totalOverdueLoans,
          loansInLast30Days: fraudDetails.details.multipleLoans.loansIn30Days,
          totalPendingAmount: fraudDetails.details.pendingLoans.amount,
          totalOverdueAmount: fraudDetails.details.overdueLoans.amount,
          maxOverdueDays: fraudDetails.details.overdueLoans.maxOverdueDays,
        },
        recommendation: fraudDetails.recommendation,
      };
      response.message += " Warning: Fraud risk detected for this borrower.";
    }

    return res.status(201).json(response);
  } catch (error) {
    if (error.name === "ValidationError") {
      const errorMessages = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        message: "Validation error",
        errors: errorMessages,
      });
    }

    return res.status(500).json({
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get all loans by lender
const getLoansByLender = async (req, res) => {
  try {
    const lenderId = req.user.id;
    let { page, limit, startDate, endDate, status, minAmount, maxAmount, search } =
      req.query;

    minAmount = minAmount ? Number(minAmount) : undefined;
    maxAmount = maxAmount ? Number(maxAmount) : undefined;

    const query = { lenderId };

    // Add name search if provided
    if (search) {
      query.name = { $regex: search, $options: 'i' }; // Case-insensitive search
    }

    if (startDate) query.loanStartDate = { $gte: new Date(startDate) };
    if (endDate)
      query.loanEndDate = { ...query.loanEndDate, $lte: new Date(endDate) };
    if (status) query.paymentStatus = status;
    if (minAmount !== undefined || maxAmount !== undefined) {
      query.amount = {};
      if (minAmount !== undefined) query.amount.$gte = minAmount;
      if (maxAmount !== undefined) query.amount.$lte = maxAmount;
    }

    const { data: loans, pagination } = await paginateQuery(
      Loan,
      query,
      page,
      limit
    );

    if (!loans.length) {
      return res
        .status(404)
        .json({ message: "No loans found for this lender" });
    }

    return res.status(200).json({
      message: "Loans fetched successfully",
      data: loans,
      pagination,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get loan details by ID (for lender)
const GetLoanDetails = async (req, res) => {
  try {
    const loanId = req.params.id;
    const loan = await Loan.findById(loanId).populate('borrowerId', 'userName mobileNo');

    if (!loan) {
      return res.status(404).json({ message: "Loan data not found" });
    }

    // Check for pending payment confirmations
    const pendingConfirmations = loan.paymentHistory.filter(
      payment => payment.paymentStatus === 'pending' && loan.paymentConfirmation === 'pending'
    );

    const responseData = {
      ...loan.toObject(),
      pendingConfirmations: pendingConfirmations.length > 0 ? {
        count: pendingConfirmations.length,
        totalAmount: pendingConfirmations.reduce((sum, payment) => sum + payment.amount, 0),
        payments: pendingConfirmations,
        message: `Borrower has submitted ${pendingConfirmations.length} payment(s) totaling ₹${pendingConfirmations.reduce((sum, payment) => sum + payment.amount, 0)} for confirmation.`
      } : null
    };

    return res.status(200).json({
      message: "Loan data fetched successfully",
      data: responseData,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server Error",
      error: error.message,
    });
  }
};

const editLoan = async (req, res) => {
  try {
    const loanId = req.params.id;
    const lenderId = req.user.id;

    // Find loan and verify it belongs to the lender
    const loan = await Loan.findById(loanId);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    // Verify loan belongs to the authenticated lender
    if (loan.lenderId.toString() !== lenderId) {
      return res.status(403).json({
        success: false,
        message: "You can only edit loans that you created",
        code: "FORBIDDEN",
      });
    }

    // Don't allow editing if loan is already confirmed and accepted by borrower
    if (loan.loanConfirmed && loan.borrowerAcceptanceStatus === 'accepted') {
      return res.status(400).json({
        success: false,
        message: "Cannot edit loan that has been confirmed and accepted by borrower",
        code: "LOAN_ACCEPTED",
      });
    }

    // Prepare update data (exclude fields that shouldn't be changed)
    const allowedFields = ['name', 'mobileNumber', 'address', 'amount', 'purpose', 'loanGivenDate', 'loanEndDate', 'loanMode'];
    const updatedData = {};
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'loanGivenDate' || field === 'loanEndDate') {
          updatedData[field] = new Date(req.body[field]);
        } else {
          updatedData[field] = req.body[field];
        }
      }
    });

    // Validate loanMode if provided
    if (updatedData.loanMode && !['cash', 'online'].includes(updatedData.loanMode)) {
      return res.status(400).json({
        success: false,
        message: "loanMode must be either 'cash' or 'online'",
      });
    }

    // Reset borrower acceptance status and loan confirmation when loan is edited
    updatedData.borrowerAcceptanceStatus = "pending";
    updatedData.loanConfirmed = false; // Reset confirmation when loan is edited
    
    // Generate new OTP if loan is being edited
    updatedData.otp = "1234";
    updatedData.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const loanUpdateData = await Loan.findByIdAndUpdate(loanId, updatedData, {
      new: true,
      runValidators: true,
    })
      .populate('lenderId', 'userName email mobileNo profileImage');

    if (!loanUpdateData) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    // Regenerate agreement if loan details changed
    if (Object.keys(updatedData).length > 1) {
      const agreementText = generateLoanAgreement(loanUpdateData);
      loanUpdateData.agreement = agreementText;
      await loanUpdateData.save();
    }

    await sendLoanUpdateNotification(
      loanUpdateData.aadhaarNumber,
      loanUpdateData
    );

    return res.status(200).json({
      success: true,
      message: "Loan updated successfully",
      data: loanUpdateData,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const errorMessages = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: errorMessages,
      });
    }

    console.error("Error updating loan:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Update loan status (lender marks as paid)
const updateLoanStatus = async (req, res) => {
  const { loanId } = req.params;
  const { status } = req.body;

  // Check if the status is either "pending" or "paid"
  if (!["pending", "paid"].includes(status)) {
    return res.status(400).json({
      message: "Invalid status value. Only 'pending' or 'paid' are allowed.",
    });
  }

  try {
    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    // Check if the loan is already in the same status
    if (loan.paymentStatus === status) {
      return res
        .status(400)
        .json({ message: `Loan is already marked as '${status}'` });
    }

    // Update the loan status
    loan.paymentStatus = status;
    await loan.save();

    await sendLoanUpdateNotification(loan.aadhaarNumber, loan);

    return res.status(200).json({
      message: "Loan status updated successfully",
      loan,
    });
  } catch (error) {
    console.error("Error updating loan status:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message || error,
    });
  }
};

// Delete loan (lender)
const deleteLoanDetails = async (req, res) => {
  try {
    const loanId = req.params.id;
    const loanData = await Loan.findByIdAndDelete(loanId);

    if (!loanData) {
      return res.status(404).json({ message: "Loan data not found" });
    }

    return res.status(200).json({
      message: "Loan deleted successfully",
      data: loanData,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get loan stats for lender
const getLoanStats = async (req, res) => {
  try {
    const { aadhaarNumber } = req.query;
    const lenderId = req.user.id;

    if (!aadhaarNumber) {
      return res.status(400).json({ message: "Aadhaar number is required" });
    }

    const loansTaken = await Loan.find({ aadhaarNumber });

    const loansPending = loansTaken.filter(
      (loan) => loan.paymentStatus === "pending"
    ).length;
    const loansPaid = loansTaken.filter(
      (loan) => loan.paymentStatus === "paid"
    ).length;

    const loansGiven = await Loan.find({ lenderId });

    return res.status(200).json({
      message: "Loan stats fetched successfully",
      data: {
        loansTakenCount: loansTaken.length || 0,
        loansPendingCount: loansPending || 0,
        loansPaidCount: loansPaid || 0,
        loansGivenCount: loansGiven.length || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching loan stats:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get recent activities for lender
const getRecentActivities = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

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

    // 1. Get loans created by lender (sorted by creation)
    const loansCreated = await Loan.find({ lenderId: userId })
      .sort({ createdAt: -1 })
      .limit(limit * 2)
      .select('name amount borrowerAcceptanceStatus createdAt')
      .lean();

    loansCreated.forEach(loan => {
      activities.push({
        type: 'loan_created',
        shortMessage: 'Loan Created',
        message: `You created a loan of ₹${loan.amount} for ${loan.name}`,
        loanId: loan._id,
        loanName: loan.name,
        amount: loan.amount,
        timestamp: loan.createdAt,
        relativeTime: getRelativeTime(loan.createdAt)
      });
    });

    // 2. Get loans with payment updates (payment received)
    const loansWithPayments = await Loan.find({ lenderId: userId })
      .sort({ updatedAt: -1 })
      .limit(limit * 3)
      .select('name amount paymentStatus paymentHistory totalPaid updatedAt')
      .lean();

    loansWithPayments.forEach(loan => {
      if (loan.paymentHistory && loan.paymentHistory.length > 0) {
        // Get most recent payment
        const recentPayment = loan.paymentHistory[loan.paymentHistory.length - 1];
        if (recentPayment.paymentStatus === 'confirmed') {
          activities.push({
            type: 'payment_received',
            shortMessage: 'Payment Received',
            message: `You received ₹${recentPayment.amount} payment from ${loan.name}`,
            loanId: loan._id,
            loanName: loan.name,
            amount: recentPayment.amount,
            paymentMode: recentPayment.paymentMode,
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
          message: `Loan of ₹${loan.amount} to ${loan.name} has been fully paid`,
          loanId: loan._id,
          loanName: loan.name,
          amount: loan.amount,
          timestamp: loan.updatedAt,
          relativeTime: getRelativeTime(loan.updatedAt)
        });
      }
    });

    // 3. Get overdue loans
    const overdueLoans = await Loan.find({
      lenderId: userId,
      'overdueDetails.isOverdue': true
    })
      .sort({ 'overdueDetails.lastOverdueCheck': -1 })
      .limit(limit)
      .select('name amount overdueDetails updatedAt')
      .lean();

    overdueLoans.forEach(loan => {
      activities.push({
        type: 'loan_overdue',
        shortMessage: 'Loan Overdue',
        message: `Loan of ₹${loan.amount} to ${loan.name} is overdue by ${loan.overdueDetails.overdueDays} days`,
        loanId: loan._id,
        loanName: loan.name,
        amount: loan.amount,
        overdueAmount: loan.overdueDetails.overdueAmount,
        overdueDays: loan.overdueDetails.overdueDays,
        timestamp: loan.overdueDetails.lastOverdueCheck || loan.updatedAt,
        relativeTime: getRelativeTime(loan.overdueDetails.lastOverdueCheck || loan.updatedAt)
      });
    });

    // 4. Get loans accepted/rejected by borrowers
    const loansStatusUpdates = await Loan.find({
      lenderId: userId,
      borrowerAcceptanceStatus: { $in: ['accepted', 'rejected'] }
    })
      .sort({ updatedAt: -1 })
      .limit(limit * 2)
      .select('name amount borrowerAcceptanceStatus updatedAt')
      .lean();

    loansStatusUpdates.forEach(loan => {
      if (loan.borrowerAcceptanceStatus === 'accepted') {
        activities.push({
          type: 'loan_accepted',
          shortMessage: 'Loan Accepted',
          message: `${loan.name} accepted your loan of ₹${loan.amount}`,
          loanId: loan._id,
          loanName: loan.name,
          amount: loan.amount,
          timestamp: loan.updatedAt,
          relativeTime: getRelativeTime(loan.updatedAt)
        });
      } else if (loan.borrowerAcceptanceStatus === 'rejected') {
        activities.push({
          type: 'loan_rejected',
          shortMessage: 'Loan Rejected',
          message: `${loan.name} rejected your loan of ₹${loan.amount}`,
          loanId: loan._id,
          loanName: loan.name,
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
    const seenLoanIds = new Set();
    
    for (const activity of activities) {
      const key = `${activity.type}_${activity.loanId}_${activity.timestamp}`;
      if (!seenLoanIds.has(key) && uniqueActivities.length < limit) {
        seenLoanIds.add(key);
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
const verifyOTPAndConfirmLoan = async (req, res) => {
  try {
    const { loanId, otp } = req.body;
    const lenderId = req.user.id;

    // Validate required fields
    if (!loanId || !otp) {
      return res.status(400).json({
        success: false,
        message: "loanId and otp are required",
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

    // Verify loan belongs to the lender
    if (loan.lenderId.toString() !== lenderId) {
      return res.status(403).json({
        success: false,
        message: "You can only confirm loans that you created",
        code: "FORBIDDEN",
      });
    }

    // Check if loan is already confirmed
    if (loan.loanConfirmed) {
      return res.status(400).json({
        success: false,
        message: "Loan is already confirmed",
      });
    }

    // Check if OTP is expired
    if (loan.otpExpiry && new Date() > loan.otpExpiry) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please create a new loan.",
        code: "OTP_EXPIRED",
      });
    }

    // Verify OTP (static: 1234)
    if (loan.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
        code: "INVALID_OTP",
      });
    }

    // OTP is valid, confirm the loan and mark borrower acceptance as accepted
    loan.loanConfirmed = true; // Loan is now confirmed after OTP verification
    loan.borrowerAcceptanceStatus = "accepted"; // Borrower accepts loan when OTP is verified
    loan.paymentStatus = "pending"; // Status remains "pending" (for payment tracking)
    loan.otpVerified = "verified"; // Mark OTP as verified
    await loan.save();

    // Send notification to borrower (non-blocking - won't throw error if no device tokens)
    sendLoanUpdateNotification(loan.aadhaarNumber, loan).catch(err => {
      console.log("Notification skipped:", err.message);
    });

    // Populate loan details for response
    const confirmedLoan = await Loan.findById(loan._id)
      .populate('lenderId', 'userName email mobileNo profileImage')
      .populate({
        path: 'borrowerId',
        select: 'userName email mobileNo aadharCardNo',
        strictPopulate: false // Allow populate even if borrowerId is null
      });

    return res.status(200).json({
      success: true,
      message: "Loan confirmed successfully. Borrower has accepted the loan.",
      data: confirmedLoan,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

/**
 * Resend OTP for Loan Confirmation
 */
const resendOTP = async (req, res) => {
  try {
    const { loanId } = req.body;
    const lenderId = req.user.id;

    if (!loanId) {
      return res.status(400).json({
        success: false,
        message: "loanId is required",
      });
    }

    const loan = await Loan.findById(loanId);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    // Verify loan belongs to the lender
    if (loan.lenderId.toString() !== lenderId) {
      return res.status(403).json({
        success: false,
        message: "You can only resend OTP for loans that you created",
        code: "FORBIDDEN",
      });
    }

    // Check if loan is already confirmed
    if (loan.loanConfirmed) {
      return res.status(400).json({
        success: false,
        message: "Loan is already confirmed",
      });
    }

    // Generate new OTP (static: 1234)
    const otp = "1234";
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    loan.otp = otp;
    loan.otpExpiry = otpExpiry;
    loan.loanConfirmed = false; // Reset confirmation when OTP is resent
    await loan.save();

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully to borrower's mobile number",
      data: {
        loanId: loan._id,
        otp: otp, // Return OTP in response for testing (remove in production)
        otpExpiry: otpExpiry,
        otpMessage: "Use this OTP to confirm the loan. OTP is valid for 10 minutes.",
      },
    });
  } catch (error) {
    console.error("Error resending OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Confirm borrower payment (lender)
const confirmPayment = async (req, res) => {
  try {
    const lenderId = req.user.id;
    const { loanId, paymentId } = req.params;
    const { notes } = req.body;

    // Find the loan
    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    // Verify lender owns this loan
    if (loan.lenderId.toString() !== lenderId) {
      return res.status(403).json({
        message: "You can only confirm payments for loans you created",
      });
    }

    // Find the payment in history
    const paymentIndex = loan.paymentHistory.findIndex(
      (payment) => payment._id.toString() === paymentId
    );

    if (paymentIndex === -1) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const payment = loan.paymentHistory[paymentIndex];

    // Check if payment is already confirmed or rejected
    if (payment.paymentStatus !== "pending") {
      return res.status(400).json({
        message: `Payment is already ${payment.paymentStatus}`,
      });
    }

    // Update payment status
    payment.paymentStatus = "confirmed";
    payment.confirmedBy = lenderId;
    payment.confirmedAt = new Date();
    if (notes) {
      payment.notes = notes;
    }

    // Update loan payment confirmation status
    loan.paymentConfirmation = "confirmed";

    // Update loan totals only if payment was previously pending
    loan.totalPaid += payment.amount;
    loan.remainingAmount = loan.amount - loan.totalPaid;

    // Update installment tracking if this is an installment payment
    if (payment.paymentType === "installment") {
      // The installmentNumber is already set when borrower submits payment
      // We don't need to increment paidInstallments here - we count confirmed installments
      
      // Calculate next due date based on frequency
      if (loan.installmentPlan.installmentFrequency === "monthly") {
        loan.installmentPlan.nextDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      } else if (loan.installmentPlan.installmentFrequency === "weekly") {
        loan.installmentPlan.nextDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      } else if (loan.installmentPlan.installmentFrequency === "quarterly") {
        loan.installmentPlan.nextDueDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      }
    }

    // Update payment status based on remaining amount
    if (loan.remainingAmount <= 0) {
      loan.paymentStatus = "paid";
      loan.remainingAmount = 0;
    } else {
      loan.paymentStatus = loan.paymentType === "installment" ? "part paid" : "part paid";
    }

    // Reset overdue status if payment brings loan current
    if (loan.remainingAmount <= 0) {
      loan.overdueDetails.isOverdue = false;
      loan.overdueDetails.overdueAmount = 0;
      loan.overdueDetails.overdueDays = 0;
    }

    await loan.save();

    // Send notification to borrower
    await sendLoanUpdateNotification(loan.aadhaarNumber, loan);

    return res.status(200).json({
      message: "Payment confirmed successfully",
      data: {
        loanId: loan._id,
        paymentId: payment._id,
        confirmedAmount: payment.amount,
        totalPaid: loan.totalPaid,
        remainingAmount: loan.remainingAmount,
        paymentStatus: loan.paymentStatus,
      },
    });

  } catch (error) {
    console.error("Error confirming payment:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Reject borrower payment (lender)
const rejectPayment = async (req, res) => {
  try {
    const lenderId = req.user.id;
    const { loanId, paymentId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        message: "Rejection reason is required",
      });
    }

    // Find the loan
    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    // Verify lender owns this loan
    if (loan.lenderId.toString() !== lenderId) {
      return res.status(403).json({
        message: "You can only reject payments for loans you created",
      });
    }

    // Find the payment in history
    const paymentIndex = loan.paymentHistory.findIndex(
      (payment) => payment._id.toString() === paymentId
    );

    if (paymentIndex === -1) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const payment = loan.paymentHistory[paymentIndex];

    // Check if payment is already confirmed or rejected
    if (payment.paymentStatus !== "pending") {
      return res.status(400).json({
        message: `Payment is already ${payment.paymentStatus}`,
      });
    }

    // Update payment status
    payment.paymentStatus = "rejected";
    payment.confirmedBy = lenderId;
    payment.confirmedAt = new Date();
    payment.notes = `Rejected: ${reason}`;

    // Update loan payment confirmation status
    loan.paymentConfirmation = "rejected";

    await loan.save();

    // Send notification to borrower
    await sendLoanUpdateNotification(loan.aadhaarNumber, loan);

    return res.status(200).json({
      message: "Payment rejected successfully",
      data: {
        loanId: loan._id,
        paymentId: payment._id,
        rejectedAmount: payment.amount,
        reason: reason,
      },
    });

  } catch (error) {
    console.error("Error rejecting payment:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get pending payments for lender review
const getPendingPayments = async (req, res) => {
  try {
    const lenderId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    // Find loans by lender with pending payments
    const loans = await Loan.find({ lenderId })
      .select('name amount totalPaid remainingAmount paymentStatus paymentHistory aadhaarNumber')
      .lean();

    // Filter loans that have pending payments
    const pendingPayments = [];
    loans.forEach(loan => {
      // Check if paymentHistory exists and is an array
      if (loan.paymentHistory && Array.isArray(loan.paymentHistory)) {
        const pending = loan.paymentHistory.filter(payment => payment.paymentStatus === 'pending');
        if (pending.length > 0) {
          pendingPayments.push({
            loanId: loan._id,
            loanName: loan.name,
            totalAmount: loan.amount,
            totalPaid: loan.totalPaid,
            remainingAmount: loan.remainingAmount,
            borrowerAadhaar: loan.aadhaarNumber,
            pendingPayments: pending,
          });
        }
      }
    });

    // Paginate results
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedPayments = pendingPayments.slice(startIndex, endIndex);

    return res.status(200).json({
      message: "Pending payments retrieved successfully",
      data: paginatedPayments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(pendingPayments.length / limit),
        totalItems: pendingPayments.length,
        itemsPerPage: parseInt(limit),
      },
    });

  } catch (error) {
    console.error("Error retrieving pending payments:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get lender loan statistics with percentages for dashboard/graph
const getLenderLoanStatistics = async (req, res) => {
  try {
    const lenderId = req.user.id;

    // Get all loans for this lender
    const loans = await Loan.find({ lenderId }).lean();

    if (!loans || loans.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No loans found for this lender",
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
      // A loan is considered overdue if:
      // 1. It's already marked as overdue (by cron job), OR
      // 2. loanEndDate has passed AND there's remaining amount AND loan is confirmed/accepted
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
      message: "Lender loan statistics fetched successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Error fetching lender loan statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Check borrower fraud status before creating loan
const checkBorrowerFraud = async (req, res) => {
  try {
    const { aadhaarNumber } = req.params;

    if (!aadhaarNumber || aadhaarNumber.length !== 12) {
      return res.status(400).json({
        success: false,
        message: "Valid Aadhaar number (12 digits) is required",
      });
    }

    // Get fraud details
    const fraudDetails = await getFraudDetails(aadhaarNumber);

    // Update borrower fraud status
    const borrower = await User.findOne({ aadharCardNo: aadhaarNumber, roleId: 2 });
    if (borrower) {
      await updateBorrowerFraudStatus(borrower._id, aadhaarNumber);
    }

    return res.status(200).json({
      success: true,
      fraudScore: fraudDetails.fraudScore,
      riskLevel: fraudDetails.riskLevel,
      flags: fraudDetails.flags,
      details: {
        totalActiveLoans: fraudDetails.flags.totalActiveLoans,
        loansInLast30Days: fraudDetails.details.multipleLoans.loansIn30Days,
        loansInLast90Days: fraudDetails.details.multipleLoans.loansIn90Days,
        loansInLast180Days: fraudDetails.details.multipleLoans.loansIn180Days,
        pendingLoansCount: fraudDetails.details.pendingLoans.count,
        pendingLoansAmount: fraudDetails.details.pendingLoans.amount,
        overdueLoansCount: fraudDetails.details.overdueLoans.count,
        overdueLoansAmount: fraudDetails.details.overdueLoans.amount,
        maxOverdueDays: fraudDetails.details.overdueLoans.maxOverdueDays,
        averageOverdueDays: fraudDetails.details.overdueLoans.maxOverdueDays, // Can be calculated if needed
      },
      recommendation: fraudDetails.recommendation,
    });
  } catch (error) {
    console.error("Error checking borrower fraud:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  createLoan,
  AddLoan: createLoan, // Keep for backward compatibility
  verifyOTPAndConfirmLoan,
  resendOTP,
  getLoansByLender,
  GetLoanDetails,
  editLoan,
  updateLoanDetails: editLoan, // Keep for backward compatibility
  updateLoanStatus,
  deleteLoanDetails,
  getLoanStats,
  getRecentActivities,
  confirmPayment,
  rejectPayment,
  getPendingPayments,
  getLenderLoanStatistics,
  checkBorrowerFraud,
};

