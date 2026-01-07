const Loan = require("../../models/Loan");
const User = require("../../models/User");
const {
  sendLoanStatusNotification,
  sendLoanUpdateNotification,
} = require("../../services/notificationService");
const paginateQuery = require("../../utils/pagination");
const { generateLoanAgreement } = require("../../services/agreementService");
const razorpayInstance = require("../../config/razorpay.config");
const crypto = require("crypto");

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

    // Verify loan belongs to the authenticated lender
    // (This check is implicit since lenderId comes from req.user.id)

    // Generate OTP (static for now - 1234)
    const otp = "1234";
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // Initialize Razorpay order data
    let razorpayOrderData = null;

    // If loanMode is "online", create Razorpay order
    if (LoanData.loanMode === "online") {
      try {
        const timestamp = Date.now();
        const shortLoanId = lenderId.toString().substring(18, 24);
        const receiptId = `loan_${shortLoanId}_${timestamp.toString().slice(-6)}`;

        const options = {
          amount: LoanData.amount * 100, // Convert to paise
          currency: "INR",
          receipt: receiptId,
          notes: {
            lenderId: lenderId.toString(),
            borrowerId: borrower._id.toString(),
            borrowerAadhaar: LoanData.aadharCardNo,
            loanAmount: LoanData.amount.toString(),
            loanPurpose: LoanData.purpose,
            lenderEmail: lender.email,
            lenderName: lender.userName || lender.name,
          },
        };

        const razorpayOrder = await razorpayInstance.orders.create(options);
        
        razorpayOrderData = {
          razorpayOrderId: razorpayOrder.id,
          razorpayPaymentStatus: "pending",
        };
      } catch (razorpayError) {
        console.error("Error creating Razorpay order:", razorpayError);
        return res.status(500).json({
          success: false,
          message: "Failed to create Razorpay order. Please try again.",
          error: razorpayError.message,
        });
      }
    }

    // Create loan with OTP (not confirmed yet)
    const newLoan = new Loan({
      name: LoanData.name,
      aadhaarNumber: LoanData.aadharCardNo,
      mobileNumber: LoanData.mobileNumber,
      address: LoanData.address,
      amount: LoanData.amount,
      purpose: LoanData.purpose,
      loanGivenDate: new Date(LoanData.loanGivenDate),
      loanEndDate: new Date(LoanData.loanEndDate),
      loanMode: LoanData.loanMode,
      lenderId,
      borrowerId: borrower._id,
      otp: otp,
      otpExpiry: otpExpiry,
      loanConfirmed: false, // Will be true after OTP verification
      paymentStatus: "pending", // Status remains "pending" until OTP is verified and beyond
      borrowerAcceptanceStatus: "pending", // For borrower to accept/reject loan
      ...razorpayOrderData, // Include Razorpay order data if online payment
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

    // Prepare response data
    const responseData = {
      ...populatedLoan.toObject(),
      otp: otp, // Return OTP in response for testing (remove in production)
      otpMessage: "Use this OTP to confirm the loan. OTP is valid for 10 minutes.",
    };

    // If online payment, include Razorpay order details
    if (LoanData.loanMode === "online" && razorpayOrderData) {
      responseData.razorpayOrder = {
        orderId: razorpayOrderData.razorpayOrderId,
        amount: LoanData.amount * 100, // Amount in paise
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_eXyUgxz2VtmepU',
        message: "Please complete the Razorpay payment to proceed with loan creation. After payment, use the verify-payment endpoint.",
      };
    }

    return res.status(201).json({
      success: true,
      message: LoanData.loanMode === "online" 
        ? "Loan created successfully. Please complete the Razorpay payment to proceed. OTP will be sent after payment verification."
        : "Loan created successfully. OTP sent to borrower's mobile number.",
      data: responseData,
    });
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
    const userId = req.user.id; // Get the logged-in user ID
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

    // 1. Get user's loans as lender (loans given) - get all and sort by most recent updates
    const loansGiven = await Loan.find({ lenderId: userId })
      .sort({ updatedAt: -1 })
      .limit(limit * 2) // Get more to filter
      .select('name amount paymentStatus borrowerAcceptanceStatus updatedAt')
      .lean();

    // 2. Get user's loans as borrower (loans taken) using aadhaarNumber
    const user = await User.findById(userId).select('aadharCardNo');
    const loansTaken = user?.aadharCardNo ?
      await Loan.find({ aadhaarNumber: user.aadharCardNo })
        .sort({ updatedAt: -1 })
        .limit(limit * 2) // Get more to filter
        .select('name amount status borrowerAcceptanceStatus updatedAt lenderId')
        .populate('lenderId', 'userName')
        .lean() : [];

    // Format activities
    const activities = [];

    // Format loans given activities
    loansGiven.forEach(loan => {
      let shortMessage = '';
      let message = '';

      if (loan.paymentStatus === 'paid') {
        shortMessage = 'Loan Repaid';
        message = `Loan of ₹${loan.amount} given to ${loan.name} has been marked as paid`;
      } else if (loan.borrowerAcceptanceStatus === 'accepted') {
        shortMessage = 'Loan Accepted';
        message = `${loan.name} accepted your loan of ₹${loan.amount}`;
      } else if (loan.borrowerAcceptanceStatus === 'rejected') {
        shortMessage = 'Loan Rejected';
        message = `${loan.name} rejected your loan of ₹${loan.amount}`;
      } else if (loan.paymentStatus === 'pending' && loan.borrowerAcceptanceStatus === 'pending') {
        shortMessage = 'Loan Given';
        message = `You gave a loan of ₹${loan.amount} to ${loan.name}`;
      } else if (loan.paymentStatus === 'pending' && loan.borrowerAcceptanceStatus === 'accepted') {
        shortMessage = 'Loan Active';
        message = `Loan of ₹${loan.amount} to ${loan.name} is active`;
      }

      // Only add if we have a message
      if (shortMessage && message) {
        activities.push({
          type: 'loan_given',
          shortMessage,
          message,
          loanId: loan._id,
          loanName: loan.name,
          amount: loan.amount,
          timestamp: loan.updatedAt,
          relativeTime: getRelativeTime(loan.updatedAt)
        });
      }
    });

    // Format loans taken activities
    loansTaken.forEach(loan => {
      let shortMessage = '';
      let message = '';

      const lenderName = loan.lenderId?.userName || 'Lender';

      if (loan.paymentStatus === 'paid') {
        shortMessage = 'Loan Paid';
        message = `You paid ₹${loan.amount} to ${lenderName}`;
      } else if (loan.borrowerAcceptanceStatus === 'accepted') {
        shortMessage = 'Loan Accepted';
        message = `You accepted loan of ₹${loan.amount} from ${lenderName}`;
      } else if (loan.borrowerAcceptanceStatus === 'rejected') {
        shortMessage = 'Loan Rejected';
        message = `You rejected loan of ₹${loan.amount} from ${lenderName}`;
      } else if (loan.paymentStatus === 'pending' && loan.borrowerAcceptanceStatus === 'pending') {
        shortMessage = 'Loan Requested';
        message = `You requested a loan of ₹${loan.amount} from ${lenderName}`;
      } else if (loan.paymentStatus === 'pending' && loan.borrowerAcceptanceStatus === 'accepted') {
        shortMessage = 'Loan Active';
        message = `Your loan of ₹${loan.amount} from ${lenderName} is active`;
      }

      // Only add if we have a message
      if (shortMessage && message) {
        activities.push({
          type: 'loan_taken',
          shortMessage,
          message,
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

    // Take only the most recent ones based on limit
    const recentActivities = activities.slice(0, limit);

    return res.status(200).json({
      message: "Recent activities fetched successfully",
      count: recentActivities.length,
      data: recentActivities,
    });
  } catch (error) {
    console.error("Error fetching recent activities:", error);
    return res.status(500).json({
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

/**
 * Verify Razorpay Payment for Loan Creation
 * This endpoint is called after the lender completes the Razorpay payment
 */
const verifyLoanPayment = async (req, res) => {
  try {
    const {
      loanId,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body;

    const lenderId = req.user.id;

    // Validate required fields
    if (!loanId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: loanId, razorpay_payment_id, razorpay_order_id, razorpay_signature",
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
        message: "You can only verify payments for loans that you created",
        code: "FORBIDDEN",
      });
    }

    // Verify loan is for online payment
    if (loan.loanMode !== "online") {
      return res.status(400).json({
        success: false,
        message: "This loan is not configured for online payment",
      });
    }

    // Verify Razorpay order ID matches
    if (loan.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: "Razorpay order ID does not match",
      });
    }

    // Check if payment is already verified
    if (loan.razorpayPaymentStatus === "completed") {
      return res.status(400).json({
        success: false,
        message: "Payment for this loan has already been verified",
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
      
      // Update loan with failed payment status
      loan.razorpayPaymentStatus = "failed";
      await loan.save();

      return res.status(400).json({
        success: false,
        message: "Payment verification failed. Invalid signature.",
        error: "Signature mismatch",
      });
    }

    // Payment is verified, update loan with payment details
    loan.razorpayPaymentId = razorpay_payment_id;
    loan.razorpaySignature = razorpay_signature;
    loan.razorpayPaymentStatus = "completed";
    
    // Update payment mode
    loan.paymentMode = "online";

    // Note: Loan is still not confirmed until OTP is verified
    // The OTP verification process remains the same as cash payments

    await loan.save();

    // Send notification to borrower (non-blocking)
    sendLoanUpdateNotification(loan.aadhaarNumber, loan).catch(err => {
      console.log("Notification skipped:", err.message);
    });

    // Populate loan details for response
    const verifiedLoan = await Loan.findById(loan._id)
      .populate('lenderId', 'userName email mobileNo profileImage')
      .populate({
        path: 'borrowerId',
        select: 'userName email mobileNo aadharCardNo',
        strictPopulate: false
      });

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully. Please verify OTP to confirm the loan.",
      data: {
        loan: verifiedLoan,
        paymentDetails: {
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          amount: loan.amount,
          currency: "INR",
          paymentStatus: "completed",
        },
        nextStep: "Verify OTP using the verify-otp endpoint to complete loan confirmation",
      },
    });
  } catch (error) {
    console.error("Error verifying loan payment:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

module.exports = {
  createLoan,
  AddLoan: createLoan, // Keep for backward compatibility
  verifyLoanPayment,
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
};

