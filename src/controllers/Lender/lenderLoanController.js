const Loan = require("../../models/Loan");
const User = require("../../models/User");
const {
  sendLoanStatusNotification,
  sendLoanUpdateNotification,
} = require("../../services/notificationService");
const paginateQuery = require("../../utils/pagination");
// Subscription related code commented out
// const Subscription = require("../../models/Subscription");
// const { canUserCreateLoan } = require("../../services/subscriptionService");
const { generateLoanAgreement } = require("../../services/agreementService");

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

    // Subscription related code commented out
    // // Check if user has active subscription
    // const { canCreate, message } = await canUserCreateLoan(lenderId);
    // if (!canCreate) {
    //   return res.status(403).json({
    //     message: message
    //   });
    // }

    // First, find the lender (current user)
    const lender = await User.findById(lenderId);

    if (!lender) {
      return res.status(404).json({
        success: false,
        message: "Lender not found",
      });
    }

    // Subscription related code commented out
    // // Check subscription - Middleware will handle this, but double-check
    // if (!lender.hasActiveSubscription) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Active subscription is required to create loans",
    //     code: "SUBSCRIPTION_REQUIRED",
    //     redirectTo: "/subscription/plans"
    //   });
    // }

    // // Check subscription expiry
    // if (lender.subscriptionExpiry && new Date() > lender.subscriptionExpiry) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Your subscription has expired. Please renew to create loans.",
    //     code: "SUBSCRIPTION_EXPIRED"
    //   });
    // }

    // // Get active subscription to check loan limit
    // const activeSubscription = await Subscription.findOne({
    //   user: lenderId,
    //   status: 'active'
    // });

    // if (activeSubscription) {
    //   // Check current loan count
    //   const currentLoanCount = await Loan.countDocuments({
    //     lenderId: lenderId,
    //     status: 'pending'
    //   });

    //   if (currentLoanCount >= activeSubscription.features.maxLoans) {
    //     return res.status(403).json({
    //       success: false,
    //       message: `Loan limit reached. Your ${lender.subscriptionPlan} plan allows maximum ${activeSubscription.features.maxLoans} active loans.`,
    //       code: "LOAN_LIMIT_EXCEEDED"
    //     });
    //   }

    //   // Check loan amount limit
    //   if (activeSubscription.features.maxLoanAmount &&
    //     LoanData.amount > activeSubscription.features.maxLoanAmount) {
    //     return res.status(403).json({
    //       success: false,
    //       message: `Loan amount exceeds your plan limit of ₹${activeSubscription.features.maxLoanAmount}`,
    //       code: "LOAN_AMOUNT_EXCEEDED"
    //     });
    //   }
    // }

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
      status: "pending", // Status remains "pending" until OTP is verified and beyond
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

    return res.status(201).json({
      success: true,
      message: "Loan created successfully. OTP sent to borrower's mobile number.",
      data: {
        ...populatedLoan.toObject(),
        otp: otp, // Return OTP in response for testing (remove in production)
        otpMessage: "Use this OTP to confirm the loan. OTP is valid for 10 minutes.",
      },
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

    console.log(error);

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
    if (status) query.status = status;
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
    const loan = await Loan.findById(loanId);

    if (!loan) {
      return res.status(404).json({ message: "Loan data not found" });
    }

    return res.status(200).json({
      message: "Loan data fetched successfully",
      data: loan,
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
    if (loan.status === status) {
      return res
        .status(400)
        .json({ message: `Loan is already marked as '${status}'` });
    }

    // Update the loan status
    loan.status = status;
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
      (loan) => loan.status === "pending"
    ).length;
    const loansPaid = loansTaken.filter(
      (loan) => loan.status === "paid"
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
      .select('name amount status borrowerAcceptanceStatus updatedAt')
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

      if (loan.status === 'paid') {
        shortMessage = 'Loan Repaid';
        message = `Loan of ₹${loan.amount} given to ${loan.name} has been marked as paid`;
      } else if (loan.borrowerAcceptanceStatus === 'accepted') {
        shortMessage = 'Loan Accepted';
        message = `${loan.name} accepted your loan of ₹${loan.amount}`;
      } else if (loan.borrowerAcceptanceStatus === 'rejected') {
        shortMessage = 'Loan Rejected';
        message = `${loan.name} rejected your loan of ₹${loan.amount}`;
      } else if (loan.status === 'pending' && loan.borrowerAcceptanceStatus === 'pending') {
        shortMessage = 'Loan Given';
        message = `You gave a loan of ₹${loan.amount} to ${loan.name}`;
      } else if (loan.status === 'pending' && loan.borrowerAcceptanceStatus === 'accepted') {
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

      if (loan.status === 'paid') {
        shortMessage = 'Loan Paid';
        message = `You paid ₹${loan.amount} to ${lenderName}`;
      } else if (loan.borrowerAcceptanceStatus === 'accepted') {
        shortMessage = 'Loan Accepted';
        message = `You accepted loan of ₹${loan.amount} from ${lenderName}`;
      } else if (loan.borrowerAcceptanceStatus === 'rejected') {
        shortMessage = 'Loan Rejected';
        message = `You rejected loan of ₹${loan.amount} from ${lenderName}`;
      } else if (loan.status === 'pending' && loan.borrowerAcceptanceStatus === 'pending') {
        shortMessage = 'Loan Requested';
        message = `You requested a loan of ₹${loan.amount} from ${lenderName}`;
      } else if (loan.status === 'pending' && loan.borrowerAcceptanceStatus === 'accepted') {
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
    loan.status = "pending"; // Status remains "pending" (for payment tracking)
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
};

