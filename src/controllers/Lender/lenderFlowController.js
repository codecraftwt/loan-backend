const User = require("../../models/User");
const LoanApplication = require("../../models/LoanApplication");
const Notification = require("../../models/Notification");
const Loan = require("../../models/Loan");
const {
  generateRepaymentSchedule,
  allocatePaymentToLoan,
} = require("../../utils/repaymentEngine");
const { expireOldPendingApplications } = require("../Borrower/borrowerFlowController");
const { buildAgreementDocument } = require("../../services/agreementService");

// ─── 1. Get Connected Borrowers (ONLY borrowers whose loan requests were accepted by this particular lender) ───
exports.getAvailableBorrowers = async (req, res) => {
  try {
    const lenderId = req.user._id;
    const { search, minCreditScore, maxCreditScore, businessType, riskGrade } = req.query;

    // 1. Find all distinct borrower IDs whose requests were accepted by this specific lender
    const appBorrowerIds = await LoanApplication.distinct("borrowerId", {
      lenderId,
      status: "accepted",
    });
    const legacyBorrowerIds = await Loan.distinct("borrowerId", {
      lenderId,
      status: { $ne: "rejected" },
    });

    // Combine all accepted borrower IDs
    const connectedBorrowerIdSet = new Set([
      ...appBorrowerIds.map((id) => id.toString()),
      ...legacyBorrowerIds.filter(Boolean).map((id) => id.toString()),
    ]);

    const connectedBorrowerIds = Array.from(connectedBorrowerIdSet);

    if (connectedBorrowerIds.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        borrowers: [],
      });
    }

    const query = {
      _id: { $in: connectedBorrowerIds },
      roleId: 2, // Borrower role
      isActive: true,
    };

    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { "borrowerProfile.businessName": { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
      ];
    }

    if (businessType) {
      query["borrowerProfile.businessType"] = businessType;
    }

    if (riskGrade) {
      query["borrowerProfile.riskGrade"] = riskGrade;
    }

    if (minCreditScore) {
      query["borrowerProfile.creditScore"] = { $gte: Number(minCreditScore) };
    }

    if (maxCreditScore) {
      query["borrowerProfile.creditScore"] = {
        ...query["borrowerProfile.creditScore"],
        $lte: Number(maxCreditScore),
      };
    }

    const rawBorrowers = await User.find(query)
      .select(
        "userName email mobileNo address panCardNumber companyName borrowerProfile createdAt"
      )
      .sort({ "borrowerProfile.creditScore": -1, createdAt: -1 });

    // Fetch latest accepted application for each connected borrower with this lender
    const borrowersWithLenderContext = await Promise.all(
      rawBorrowers.map(async (b) => {
        const latestApp = await LoanApplication.findOne({
          borrowerId: b._id,
          lenderId,
          status: "accepted",
        }).sort({ createdAt: -1 });

        return {
          ...b.toObject(),
          connectionSummary: {
            latestStatus: latestApp ? latestApp.status : "accepted",
            latestAmount: latestApp ? latestApp.amount : null,
            latestPurpose: latestApp ? latestApp.purpose : null,
            appliedAt: latestApp ? latestApp.createdAt : null,
            acceptedAt: latestApp ? latestApp.acceptedAt : null,
          },
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: borrowersWithLenderContext.length,
      borrowers: borrowersWithLenderContext,
    });
  } catch (error) {
    console.error("Error fetching connected borrowers:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching connected borrowers",
      error: error.message,
    });
  }
};

// ─── 2. Get Single Borrower Details & History (Connected to this Lender) ───
exports.getBorrowerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const borrower = await User.findOne({ _id: id, roleId: 2 }).select(
      "userName email mobileNo address panCardNumber aadharCardNo companyName borrowerProfile digilockerKyc createdAt"
    );

    if (!borrower) {
      return res.status(404).json({
        success: false,
        message: "Borrower not found",
      });
    }

    // Get all loans this borrower has taken across the platform
    const loanQuery = [{ borrowerId: borrower._id }];
    if (borrower.aadharCardNo) loanQuery.push({ aadhaarNumber: borrower.aadharCardNo });
    if (borrower.mobileNo) loanQuery.push({ mobileNumber: borrower.mobileNo });

    const loans = await Loan.find({ $or: loanQuery })
      .populate("lenderId", "companyName userName email mobileNo")
      .sort({ createdAt: -1 })
      .lean();

    const totalLoansCount = loans.length;
    const totalLoanAmount = loans.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const totalPaidAmount = loans.reduce((s, l) => s + (Number(l.totalPaid) || 0), 0);
    const totalRemainingAmount = loans.reduce((s, l) => s + (Number(l.remainingAmount) || 0), 0);
    const hasActiveLoan = loans.some((l) => l.paymentStatus === "pending" || l.paymentStatus === "part paid");
    const hasOverdueLoan = loans.some((l) => l.paymentStatus === "overdue");

    // Get applications this borrower sent to this specific lender
    const historyWithLender = await LoanApplication.find({
      borrowerId: id,
      lenderId: req.user._id,
    }).sort({ createdAt: -1 });

    const formattedLoans = loans.map((l) => ({
      _id: l._id,
      loanId: l._id,
      amount: l.amount,
      totalPaid: l.totalPaid,
      remainingAmount: l.remainingAmount,
      remainigAmount: l.remainingAmount,
      paymentStatus: l.paymentStatus,
      loanGivenDate: l.loanGivenDate || l.createdAt,
      loanEndDate: l.loanEndDate,
      purpose: l.purpose || l.dealName || "Commercial Loan",
      dealName: l.dealName || l.purpose || "Commercial Loan",
      lenderName: l.lenderId?.companyName || l.lenderId?.userName || "Institutional Lender",
      lenderEmail: l.lenderId?.email,
      interestRate: l.interestRate,
      tenureMonths: l.tenureMonths,
      monthlyEmi: l.monthlyEmi,
    }));

    return res.status(200).json({
      success: true,
      borrower: {
        ...borrower.toObject(),
        totalLoansCount,
        totalLoanAmount,
        totalPaidAmount,
        totalRemainingAmount,
        hasActiveLoan,
        hasOverdueLoan,
        loans: formattedLoans,
      },
      loans: formattedLoans,
      summary: {
        totalLoansCount,
        totalLoanAmount,
        totalPaidAmount,
        totalRemainingAmount,
        hasActiveLoan,
        hasOverdueLoan,
      },
      historyWithLender,
    });
  } catch (error) {
    console.error("Error fetching borrower details:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching borrower details",
      error: error.message,
    });
  }
};

// ─── 3. Get Incoming Loan Requests (Received by this Lender) ───
exports.getIncomingRequests = async (req, res) => {
  try {
    await expireOldPendingApplications();
    const lenderId = req.user._id;
    const { status, search } = req.query;

    const query = { lenderId };

    if (status && status !== "all") {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { "borrowerSnapshot.userName": { $regex: search, $options: "i" } },
        { "borrowerSnapshot.businessName": { $regex: search, $options: "i" } },
        { purpose: { $regex: search, $options: "i" } },
      ];
    }

    const requests = await LoanApplication.find(query)
      .populate(
        "borrowerId",
        "userName email mobileNo altMobileNo address city taluka district state pincode aadharCardNo panCardNumber companyName borrowerProfile profileImage createdAt"
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error("Error fetching incoming requests:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching incoming requests",
      error: error.message,
    });
  }
};

// ─── 4. Get Single Request Details ───
exports.getRequestById = async (req, res) => {
  try {
    await expireOldPendingApplications();
    const { id } = req.params;
    const lenderId = req.user._id;

    const request = await LoanApplication.findOne({ _id: id, lenderId }).populate(
      "borrowerId",
      "userName email mobileNo altMobileNo address city taluka district state pincode aadharCardNo panCardNumber companyName borrowerProfile profileImage digilockerKyc createdAt"
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Loan request not found or unauthorized.",
      });
    }

    // Fetch borrower's total loan history across all lenders for comprehensive underwriting
    let borrowerLoans = [];
    let borrowerSummary = null;
    if (request.borrowerId) {
      const b = request.borrowerId;
      const loanQuery = [{ borrowerId: b._id }];
      if (b.aadharCardNo) loanQuery.push({ aadhaarNumber: b.aadharCardNo });
      if (b.mobileNo) loanQuery.push({ mobileNumber: b.mobileNo });

      const rawLoans = await Loan.find({ $or: loanQuery })
        .populate("lenderId", "companyName userName email")
        .sort({ createdAt: -1 })
        .lean();

      const totalLoansCount = rawLoans.length;
      const totalLoanAmount = rawLoans.reduce((s, l) => s + (Number(l.amount) || 0), 0);
      const totalPaidAmount = rawLoans.reduce((s, l) => s + (Number(l.totalPaid) || 0), 0);
      const totalRemainingAmount = rawLoans.reduce((s, l) => s + (Number(l.remainingAmount) || 0), 0);

      borrowerSummary = {
        totalLoansCount,
        totalLoanAmount,
        totalPaidAmount,
        totalRemainingAmount,
        hasActiveLoan: rawLoans.some((l) => l.paymentStatus === "pending" || l.paymentStatus === "part paid"),
        hasOverdueLoan: rawLoans.some((l) => l.paymentStatus === "overdue"),
      };

      borrowerLoans = rawLoans.map((l) => ({
        _id: l._id,
        loanId: l._id,
        amount: l.amount,
        totalPaid: l.totalPaid,
        remainingAmount: l.remainingAmount,
        paymentStatus: l.paymentStatus,
        loanGivenDate: l.loanGivenDate || l.createdAt,
        loanEndDate: l.loanEndDate,
        purpose: l.purpose || l.dealName || "Commercial Loan",
        lenderName: l.lenderId?.companyName || l.lenderId?.userName || "Institutional Lender",
      }));
    }

    return res.status(200).json({
      success: true,
      request,
      borrowerLoans,
      borrowerSummary,
    });
  } catch (error) {
    console.error("Error fetching request details:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching request details",
      error: error.message,
    });
  }
};

// ─── 5. ACCEPT LOAN REQUEST (Atomic Acceptance + Auto-Rejection of Other Pending Requests) ───
exports.acceptLoanRequest = async (req, res) => {
  try {
    await expireOldPendingApplications();
    const { id } = req.params;
    const lenderId = req.user._id;

    // Fetch the target application
    const targetApplication = await LoanApplication.findOne({ _id: id, lenderId });

    if (!targetApplication) {
      return res.status(404).json({
        success: false,
        message: "Loan application not found or unauthorized.",
      });
    }

    // Check if the application is still pending
    if (targetApplication.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `This application cannot be accepted because it is already marked as '${targetApplication.status}'.`,
      });
    }

    // Check 48-hour expiration
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    if (new Date(targetApplication.createdAt) < fortyEightHoursAgo) {
      targetApplication.status = "auto_rejected";
      targetApplication.rejectionReason = "Auto-rejected: Request expired after 48 hours without lender response.";
      targetApplication.actionTakenAt = new Date();
      await targetApplication.save();
      return res.status(400).json({
        success: false,
        message: "This loan request has expired (exceeded 48 hours without response) and can no longer be accepted.",
      });
    }

    const lender = await User.findById(lenderId);
    const lenderName = lender?.companyName || lender?.userName || "Institutional Lender";

    // 1. Extract Sanction Terms & Digital Signature
    const sanctionedAmount = Number(req.body?.amount) || targetApplication.amount;
    const repaymentType = req.body?.repaymentType === "ONE_TIME" ? "ONE_TIME" : "EMI";
    const annualInterestRate =
      Number(req.body?.interestRate) || targetApplication.requestedRate || 12;
    const tenureMonths =
      Number(req.body?.tenureMonths) || targetApplication.tenureMonths || 12;
    const processingFee = Number(req.body?.processingFee) || 0;
    const signatureData = req.body?.signatureData || null;
    const signedBy = req.body?.signedBy || lenderName;
    const clientIp = req.ip || req.connection?.remoteAddress || "127.0.0.1";

    let monthlyEmi = 0;
    let totalInterest = 0;
    let totalPayable = sanctionedAmount;
    const maturityDate = new Date();
    maturityDate.setMonth(maturityDate.getMonth() + tenureMonths);
    const firstDueDate = new Date();
    firstDueDate.setDate(firstDueDate.getDate() + 30);

    if (repaymentType === "EMI") {
      const r = (annualInterestRate / 100) / 12;
      monthlyEmi = Math.round((sanctionedAmount * r * Math.pow(1 + r, tenureMonths)) / (Math.pow(1 + r, tenureMonths) - 1));
      totalPayable = monthlyEmi * tenureMonths;
      totalInterest = totalPayable - sanctionedAmount;
    } else {
      if (req.body?.manualInterestAmount !== undefined && req.body?.manualInterestAmount !== null && !isNaN(req.body?.manualInterestAmount)) {
        totalInterest = Math.round(Number(req.body.manualInterestAmount));
        totalPayable = sanctionedAmount + totalInterest;
      } else {
        totalInterest = Math.round(sanctionedAmount * (annualInterestRate / 100) * (tenureMonths / 12));
        totalPayable = sanctionedAmount + totalInterest;
      }
      monthlyEmi = 0;
    }

    const docId = `AGR-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const sanctionTerms = {
      amount: sanctionedAmount,
      repaymentType,
      interestRate: annualInterestRate,
      tenureMonths,
      processingFee,
      monthlyEmi,
      totalInterest,
      totalPayable,
      maturityDate,
      firstDueDate,
    };

    const lenderSignature = {
      signatureData,
      signedBy,
      signedAt: new Date(),
      ipAddress: clientIp,
    };

    // 2. Mark target application as accepted with Agreement
    const initialDisbursalOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const initialOtpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    targetApplication.amount = sanctionedAmount;
    targetApplication.repaymentType = repaymentType;
    targetApplication.requestedRate = annualInterestRate;
    targetApplication.tenureMonths = tenureMonths;
    targetApplication.status = "accepted";
    targetApplication.acceptedAt = new Date();
    targetApplication.actionTakenAt = new Date();
    targetApplication.disbursalVerification = {
      otp: initialDisbursalOtp,
      otpExpiresAt: initialOtpExpiry,
      otpAttempts: 0,
      isVerified: false,
      verifiedAt: null,
      disbursedAt: null,
      disbursalMode: "direct",
    };
    targetApplication.agreement = {
      documentId: docId,
      status: "lender_signed",
      sanctionTerms,
      lenderSignature,
      borrowerSignature: null,
      executedAt: null,
    };
    await targetApplication.save();

    // 3. ATOMIC AUTO-REJECTION of ALL other pending applications for this borrower
    const autoRejectQuery = {
      borrowerId: targetApplication.borrowerId,
      _id: { $ne: targetApplication._id },
      status: "pending",
    };

    const autoRejectedResult = await LoanApplication.updateMany(autoRejectQuery, {
      $set: {
        status: "auto_rejected",
        rejectionReason: `Automatically closed because your loan was accepted and sanctioned by ${lenderName}.`,
        actionTakenAt: new Date(),
      },
    });

    const autoRejectedCount = autoRejectedResult.modifiedCount || 0;

    // 4. Auto-generate active Loan facility and repayment schedule
    const borrower = await User.findById(targetApplication.borrowerId);
    const engineRepaymentType = repaymentType === "ONE_TIME" ? "one-time" : "installment";
    const calculationMethod = repaymentType === "ONE_TIME" ? "bullet" : "reducing";

    const scheduleData = generateRepaymentSchedule({
      principal: sanctionedAmount,
      annualInterestRate,
      tenureMonths,
      repaymentType: engineRepaymentType,
      calculationMethod,
      startDate: new Date(),
      firstDueDate,
      customTotalInterest: repaymentType === "ONE_TIME" ? totalInterest : null,
      customMaturityDate: repaymentType === "ONE_TIME" ? maturityDate : null,
    });

    let createdLoan = await Loan.findOne({ applicationId: targetApplication._id });
    if (!createdLoan) {
      createdLoan = await Loan.create({
        name: borrower?.userName || targetApplication.borrowerSnapshot?.userName || "Borrower",
        borrowerId: targetApplication.borrowerId,
        lenderId,
        applicationId: targetApplication._id,
        mobileNumber:
          borrower?.mobileNo || targetApplication.borrowerSnapshot?.mobileNo || "9999999999",
        address:
          borrower?.address || targetApplication.borrowerSnapshot?.address || "Address",
        aadhaarNumber:
          borrower?.aadharCardNo || targetApplication.borrowerSnapshot?.aadharCardNo || "",
        amount: sanctionedAmount,
        purpose: targetApplication.purpose || "Commercial Loan Facility",
        dealName: `${targetApplication.purpose || "Loan"} - ${
          borrower?.companyName || borrower?.userName || "Borrower"
        }`,
        status: "pending_disbursal",
        disbursalVerification: {
          otp: initialDisbursalOtp,
          otpExpiresAt: initialOtpExpiry,
          otpAttempts: 0,
          isVerified: false,
          verifiedAt: null,
          disbursedAt: null,
          disbursalMode: "direct",
        },
        repaymentType: engineRepaymentType,
        repaymentMethod: calculationMethod,
        interestRate: annualInterestRate,
        tenureMonths: tenureMonths,
        monthlyEmi: monthlyEmi,
        totalRepaymentExpected: totalPayable,
        totalInterestExpected: totalInterest,
        remainingAmount: totalPayable,
        totalPaid: 0,
        installments: scheduleData.installments,
        installmentPlan: {
          totalInstallments: scheduleData.installments.length,
          paidInstallments: 0,
          installmentAmount: monthlyEmi || totalPayable,
          nextDueDate: scheduleData.installments[0]?.dueDate || null,
          installmentFrequency: "monthly",
        },
        loanStartDate: new Date(),
        loanEndDate: maturityDate,
        paymentStatus: "pending",
        borrowerAcceptanceStatus: "accepted",
        loanMode: "online",
        paymentMode: "online",
      });
    }

    // 4. Update Lender stats
    if (lender) {
      lender.lenderProfile = {
        ...lender.lenderProfile,
        totalLoansFunded: (lender.lenderProfile?.totalLoansFunded || 0) + 1,
        totalDisbursedAmount:
          (lender.lenderProfile?.totalDisbursedAmount || 0) + targetApplication.amount,
      };
      await lender.save();
    }

    // 5. Update Borrower stats
    await User.findByIdAndUpdate(targetApplication.borrowerId, {
      $inc: { "borrowerProfile.totalLoansTaken": 1 },
    });

    // 6. Create In-App Notifications for the Borrower
    const notificationsToCreate = [
      {
        userId: targetApplication.borrowerId,
        title: "Loan Application Accepted! 🎉",
        message: `Great news! ${lenderName} has accepted your loan request of ₹${targetApplication.amount.toLocaleString(
          "en-IN"
        )} (${targetApplication.purpose}). Repayment terms configured.`,
        type: "loan_accepted",
        metadata: {
          applicationId: targetApplication._id,
          loanId: createdLoan._id,
          applicationGroupId: targetApplication.applicationGroupId,
          amount: targetApplication.amount,
          lenderName,
        },
      },
      {
        userId: targetApplication.borrowerId,
        title: "Loan Disbursal Verification Code 🔐",
        message: `Your loan verification code is ${initialDisbursalOtp}. Share this 6-digit code with ${lenderName} to confirm disbursal and activate your loan facility.`,
        type: "disbursal_otp",
        metadata: {
          applicationId: targetApplication._id,
          loanId: createdLoan._id,
          otp: initialDisbursalOtp,
          lenderName,
          expiresAt: initialOtpExpiry,
        },
      },
    ];

    if (autoRejectedCount > 0) {
      notificationsToCreate.push({
        userId: targetApplication.borrowerId,
        title: "Other Pending Applications Closed",
        message: `${autoRejectedCount} other pending application(s) from your batch have been automatically closed since your deal was accepted by ${lenderName}.`,
        type: "loan_auto_rejected",
        metadata: {
          applicationGroupId: targetApplication.applicationGroupId,
          autoRejectedCount,
          acceptedByLender: lenderName,
        },
      });
    }

    await Notification.insertMany(notificationsToCreate);

    return res.status(200).json({
      success: true,
      message: `You have successfully accepted the loan application for ₹${targetApplication.amount.toLocaleString(
        "en-IN"
      )}. Verification OTP sent to borrower.`,
      application: targetApplication,
      loan: createdLoan,
      autoRejectedApplicationsCount: autoRejectedCount,
    });
  } catch (error) {
    console.error("Error accepting loan request:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while accepting loan request",
      error: error.message,
    });
  }
};

// ─── 5.1 Initiate / Resend Loan Disbursal OTP (Lender triggers, Borrower receives OTP) ───
exports.initiateLoanDisbursalOtp = async (req, res) => {
  try {
    const { id } = req.params;
    const lenderId = req.user._id;

    let loan = await Loan.findOne({
      $or: [{ _id: id }, { applicationId: id }],
      lenderId,
    });
    let application = await LoanApplication.findOne({
      $or: [{ _id: id }, { _id: loan?.applicationId }],
      lenderId,
    });

    if (!loan && !application) {
      return res.status(404).json({
        success: false,
        message: "Loan facility or application not found or unauthorized.",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    const disbursalVerification = {
      otp,
      otpExpiresAt,
      otpAttempts: 0,
      isVerified: false,
      verifiedAt: null,
      disbursedAt: null,
      disbursalMode: "direct",
    };

    if (loan) {
      loan.disbursalVerification = disbursalVerification;
      loan.status = "pending_disbursal";
      await loan.save();
    }

    if (application) {
      application.disbursalVerification = disbursalVerification;
      await application.save();
    }

    const borrowerId = loan?.borrowerId || application?.borrowerId;
    const lender = await User.findById(lenderId);
    const lenderName = lender?.companyName || lender?.userName || "Lender";

    await Notification.create({
      userId: borrowerId,
      title: "Loan Disbursal Verification Code 🔐",
      message: `Your 6-digit loan disbursal verification code is ${otp}. Please share this code with ${lenderName} to confirm agreement and receive loan funds. Code is valid for 15 minutes.`,
      type: "disbursal_otp",
      metadata: {
        loanId: loan?._id,
        applicationId: application?._id,
        otp,
        lenderName,
        expiresAt: otpExpiresAt,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Disbursal OTP code generated and sent to borrower.",
      expiresInSeconds: 900,
      expiresAt: otpExpiresAt,
    });
  } catch (error) {
    console.error("Error generating disbursal OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while generating disbursal OTP",
      error: error.message,
    });
  }
};

// ─── 5.2 Verify Loan Disbursal OTP (Lender enters borrower's OTP to activate loan) ───
exports.verifyLoanDisbursalOtp = async (req, res) => {
  try {
    const { id } = req.params;
    const { otp } = req.body;
    const lenderId = req.user._id;

    if (!otp || !otp.toString().trim()) {
      return res.status(400).json({
        success: false,
        message: "Please enter the 6-digit OTP code provided by the borrower.",
      });
    }

    let loan = await Loan.findOne({
      $or: [{ _id: id }, { applicationId: id }],
      lenderId,
    });
    let application = await LoanApplication.findOne({
      $or: [{ _id: id }, { _id: loan?.applicationId }],
      lenderId,
    });

    if (!loan && !application) {
      return res.status(404).json({
        success: false,
        message: "Loan facility not found or unauthorized.",
      });
    }

    const verification = loan?.disbursalVerification || application?.disbursalVerification;

    if (!verification || !verification.otp) {
      return res.status(400).json({
        success: false,
        message: "No active disbursal OTP found. Please click 'Generate OTP' first.",
      });
    }

    if (verification.isVerified) {
      return res.status(400).json({
        success: false,
        message: "This loan has already been verified and disbursed.",
      });
    }

    if (verification.otpAttempts >= 5) {
      return res.status(400).json({
        success: false,
        message: "Maximum OTP attempts exceeded. Please click 'Resend OTP' to generate a fresh code.",
      });
    }

    if (new Date() > new Date(verification.otpExpiresAt)) {
      return res.status(400).json({
        success: false,
        message: "This OTP code has expired. Please click 'Resend OTP' to generate a new code.",
      });
    }

    const inputOtp = otp.toString().trim();
    const storedOtp = verification.otp.toString().trim();

    if (inputOtp !== storedOtp) {
      if (loan) {
        loan.disbursalVerification.otpAttempts = (loan.disbursalVerification.otpAttempts || 0) + 1;
        await loan.save();
      }
      if (application) {
        application.disbursalVerification.otpAttempts = (application.disbursalVerification.otpAttempts || 0) + 1;
        await application.save();
      }
      const attemptsLeft = 5 - (verification.otpAttempts + 1);
      return res.status(400).json({
        success: false,
        message: `Incorrect OTP code. Please enter the 6-digit code shown on the borrower's screen. (${attemptsLeft} attempts remaining)`,
      });
    }

    // OTP is correct! Mark verified and disburse loan
    const now = new Date();
    const verifiedUpdate = {
      otp: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      isVerified: true,
      verifiedAt: now,
      disbursedAt: now,
      disbursalMode: "direct",
    };

    if (application) {
      application.disbursalVerification = verifiedUpdate;
      application.status = "accepted";
      await application.save();
    }

    if (loan) {
      loan.disbursalVerification = verifiedUpdate;
      loan.status = "active";
      loan.loanStartDate = now;

      // Recalculate schedule starting from today so 1st installment aligns with disbursal date
      const scheduleData = generateRepaymentSchedule({
        principal: loan.amount,
        annualInterestRate: loan.interestRate || 12,
        tenureMonths: loan.tenureMonths || 12,
        repaymentType: loan.repaymentType || "installment",
        calculationMethod: loan.repaymentMethod || "reducing",
        startDate: now,
      });

      loan.installments = scheduleData.installments;
      loan.loanEndDate = scheduleData.maturityDate;
      loan.monthlyEmi = scheduleData.monthlyEmi;
      loan.totalRepaymentExpected = scheduleData.totalRepayment;
      loan.totalInterestExpected = scheduleData.totalInterest;
      loan.remainingAmount = scheduleData.totalRepayment;
      loan.installmentPlan.nextDueDate = scheduleData.installments[0]?.dueDate || null;
      await loan.save();
    }

    const borrowerId = loan?.borrowerId || application?.borrowerId;
    const lender = await User.findById(lenderId);
    const lenderName = lender?.companyName || lender?.userName || "Lender";

    await Notification.create({
      userId: borrowerId,
      title: "Loan Disbursed & Facility Active! 🚀",
      message: `Congratulations! ${lenderName} has verified your OTP and successfully disbursed your loan facility of ₹${(loan?.amount || application?.amount || 0).toLocaleString("en-IN")}. Your EMI repayment schedule is now live.`,
      type: "loan_disbursed",
      metadata: {
        loanId: loan?._id,
        applicationId: application?._id,
        amount: loan?.amount || application?.amount,
        lenderName,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Borrower OTP verified successfully! The loan facility is now active and disbursed.",
      loan,
    });
  } catch (error) {
    console.error("Error verifying disbursal OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while verifying disbursal OTP",
      error: error.message,
    });
  }
};

// ─── 6. REJECT LOAN REQUEST ───
exports.rejectLoanRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const lenderId = req.user._id;

    const targetApplication = await LoanApplication.findOne({ _id: id, lenderId });

    if (!targetApplication) {
      return res.status(404).json({
        success: false,
        message: "Loan application not found or unauthorized.",
      });
    }

    if (targetApplication.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `This application is already '${targetApplication.status}'.`,
      });
    }

    const lender = await User.findById(lenderId);
    const lenderName = lender?.companyName || lender?.userName || "Lender";

    targetApplication.status = "rejected";
    targetApplication.rejectionReason = reason || "Application does not meet current credit criteria.";
    targetApplication.actionTakenAt = new Date();
    await targetApplication.save();

    // Send notification to borrower
    await Notification.create({
      userId: targetApplication.borrowerId,
      title: "Loan Application Declined",
      message: `${lenderName} has declined your loan request for ₹${targetApplication.amount.toLocaleString(
        "en-IN"
      )}.${reason ? " Reason: " + reason : ""}`,
      type: "loan_rejected",
      metadata: {
        applicationId: targetApplication._id,
        amount: targetApplication.amount,
        lenderName,
        rejectionReason: targetApplication.rejectionReason,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Loan application rejected successfully.",
      application: targetApplication,
    });
  } catch (error) {
    console.error("Error rejecting loan request:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while rejecting loan request",
      error: error.message,
    });
  }
};

// ─── 7. Get & Update Lender Profile / Services Setup ───
exports.getLenderProfile = async (req, res) => {
  try {
    const lenderId = req.user.id || req.user._id;
    const lender = await User.findById(lenderId).select(
      "userName email mobileNo address city taluka district state pincode panCardNumber companyName licenseNumber stateOfOperation lenderProfile createdAt"
    );

    return res.status(200).json({
      success: true,
      lender,
    });
  } catch (error) {
    console.error("Error fetching lender profile:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching lender profile",
      error: error.message,
    });
  }
};

exports.updateLenderProfile = async (req, res) => {
  try {
    const {
      userName,
      email,
      mobileNo,
      companyName,
      licenseNumber,
      address,
      city,
      taluka,
      district,
      state,
      pincode,
      stateOfOperation,
      minInterestRate,
      maxInterestRate,
      servicesOffered,
      experienceYears,
      bio,
      minLoanAmount,
      maxLoanAmount,
      turnaroundTime,
    } = req.body;

    const lenderId = req.user.id || req.user._id;
    const lender = await User.findById(lenderId);
    if (!lender) {
      return res.status(404).json({ success: false, message: "Lender not found" });
    }

    // If email is provided and different, check uniqueness
    if (email && email.toLowerCase() !== lender.email.toLowerCase()) {
      const existingEmail = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: lender._id },
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: "Email address is already in use by another account.",
        });
      }
      lender.email = email.toLowerCase().trim();
    }

    if (userName !== undefined) lender.userName = userName;
    if (mobileNo !== undefined) lender.mobileNo = mobileNo;
    if (companyName !== undefined) lender.companyName = companyName;
    if (licenseNumber !== undefined) lender.licenseNumber = licenseNumber;
    if (address !== undefined) lender.address = address;
    if (city !== undefined) lender.city = city;
    if (taluka !== undefined) lender.taluka = taluka;
    if (district !== undefined) lender.district = district;
    if (state !== undefined) lender.state = state;
    if (pincode !== undefined) lender.pincode = pincode;
    if (stateOfOperation !== undefined) lender.stateOfOperation = stateOfOperation;

    lender.lenderProfile = {
      ...lender.lenderProfile,
      minInterestRate:
        minInterestRate !== undefined ? Number(minInterestRate) : lender.lenderProfile?.minInterestRate,
      maxInterestRate:
        maxInterestRate !== undefined ? Number(maxInterestRate) : lender.lenderProfile?.maxInterestRate,
      servicesOffered:
        Array.isArray(servicesOffered) ? servicesOffered : lender.lenderProfile?.servicesOffered,
      experienceYears:
        experienceYears !== undefined ? Number(experienceYears) : lender.lenderProfile?.experienceYears,
      bio: bio !== undefined ? bio : lender.lenderProfile?.bio,
      minLoanAmount:
        minLoanAmount !== undefined ? Number(minLoanAmount) : lender.lenderProfile?.minLoanAmount,
      maxLoanAmount:
        maxLoanAmount !== undefined ? Number(maxLoanAmount) : lender.lenderProfile?.maxLoanAmount,
      turnaroundTime:
        turnaroundTime !== undefined ? turnaroundTime : lender.lenderProfile?.turnaroundTime,
      licenseNumber:
        licenseNumber !== undefined ? licenseNumber : (lender.lenderProfile?.licenseNumber || licenseNumber),
    };

    await lender.save();

    return res.status(200).json({
      success: true,
      message: "Lender profile, contact details, location, and terms saved successfully.",
      lender,
    });
  } catch (error) {
    console.error("Error updating lender profile:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating lender profile",
      error: error.message,
    });
  }
};

// ─── 8. Lender Dashboard Stats ───
exports.getLenderDashboardStats = async (req, res) => {
  try {
    const lenderId = req.user._id;

    const totalRequests = await LoanApplication.countDocuments({ lenderId });
    const pendingRequests = await LoanApplication.countDocuments({ lenderId, status: "pending" });
    const acceptedRequests = await LoanApplication.countDocuments({ lenderId, status: "accepted" });
    const rejectedRequests = await LoanApplication.countDocuments({
      lenderId,
      status: { $in: ["rejected", "auto_rejected"] },
    });

    // Count of distinct connected borrowers accepted by this specific lender
    const appBorrowerIds = await LoanApplication.distinct("borrowerId", {
      lenderId,
      status: "accepted",
    });
    const legacyBorrowerIds = await Loan.distinct("borrowerId", {
      lenderId,
      status: { $ne: "rejected" },
    });
    const connectedBorrowersCount = new Set([
      ...appBorrowerIds.map((id) => id.toString()),
      ...legacyBorrowerIds.filter(Boolean).map((id) => id.toString()),
    ]).size;

    // Recent pending requests
    const recentPendingRequests = await LoanApplication.find({ lenderId, status: "pending" })
      .populate("borrowerId", "userName email mobileNo companyName borrowerProfile")
      .sort({ createdAt: -1 })
      .limit(5);

    return res.status(200).json({
      success: true,
      stats: {
        totalRequests,
        pendingRequests,
        acceptedRequests,
        rejectedRequests,
        availableBorrowersCount: connectedBorrowersCount,
        connectedBorrowersCount,
        recentPendingRequests,
      },
    });
  } catch (error) {
    console.error("Error fetching lender dashboard stats:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching lender dashboard stats",
      error: error.message,
    });
  }
};

// ─── 9. Get Loans Portfolio (All Loans for this Lender with Aggregate Metrics) ───
exports.getLenderLoansPortfolio = async (req, res) => {
  try {
    const lenderId = req.user._id;
    const { status, search } = req.query;

    const query = { lenderId };

    if (status && status !== "all") {
      if (status === "overdue") {
        query["installments.status"] = "overdue";
      } else if (status === "active") {
        query.status = "active";
      } else if (status === "closed") {
        query.status = { $in: ["closed", "paid"] };
      } else {
        query.status = status;
      }
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { dealName: { $regex: search, $options: "i" } },
        { mobileNumber: { $regex: search, $options: "i" } },
        { purpose: { $regex: search, $options: "i" } },
      ];
    }

    const loans = await Loan.find(query)
      .populate("borrowerId", "userName email mobileNo companyName borrowerProfile address city")
      .populate("applicationId", "amount purpose requestedRate status createdAt")
      .sort({ createdAt: -1 });

    // Calculate aggregate portfolio KPI metrics
    const allLenderLoans = await Loan.find({ lenderId });
    const totalDisbursed = allLenderLoans.reduce((sum, l) => sum + (l.amount || 0), 0);
    const totalCollected = allLenderLoans.reduce((sum, l) => sum + (l.totalPaid || 0), 0);
    const totalOutstanding = allLenderLoans.reduce(
      (sum, l) => sum + (l.remainingAmount || 0),
      0
    );
    const totalInterestExpected = allLenderLoans.reduce(
      (sum, l) => sum + (l.totalInterestExpected || 0),
      0
    );
    const activeCount = allLenderLoans.filter((l) => l.status === "active").length;
    const closedCount = allLenderLoans.filter(
      (l) => l.status === "closed" || l.paymentStatus === "paid"
    ).length;
    const overdueCount = allLenderLoans.filter((l) =>
      l.installments?.some((inst) => inst.status === "overdue")
    ).length;

    return res.status(200).json({
      success: true,
      count: loans.length,
      portfolioMetrics: {
        totalDisbursed,
        totalCollected,
        totalOutstanding,
        totalInterestExpected,
        totalLoans: allLenderLoans.length,
        activeCount,
        closedCount,
        overdueCount,
      },
      loans,
    });
  } catch (error) {
    console.error("Error fetching loan portfolio:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching loan portfolio",
      error: error.message,
    });
  }
};

// ─── 10. Get Single Loan Details with Schedule & History ───
exports.getLenderLoanById = async (req, res) => {
  try {
    const { id } = req.params;
    const lenderId = req.user._id;

    const loan = await Loan.findOne({ _id: id, lenderId })
      .populate(
        "borrowerId",
        "userName email mobileNo address city taluka district state pincode aadharCardNo panCardNumber companyName borrowerProfile profileImage createdAt"
      )
      .populate("lenderId", "userName companyName email mobileNo")
      .populate("applicationId");

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan facility not found or unauthorized",
      });
    }

    // Auto-generate installments if missing for legacy loan records
    if (!loan.installments || loan.installments.length === 0) {
      const scheduleData = generateRepaymentSchedule({
        principal: loan.amount,
        annualInterestRate: loan.interestRate || 12,
        tenureMonths: loan.tenureMonths || 12,
        repaymentType: loan.repaymentType || "installment",
        calculationMethod: loan.repaymentMethod || "reducing",
        startDate: loan.loanStartDate || loan.createdAt || new Date(),
      });

      loan.installments = scheduleData.installments;
      loan.monthlyEmi = scheduleData.monthlyEmi;
      loan.totalRepaymentExpected = scheduleData.totalRepayment;
      loan.totalInterestExpected = scheduleData.totalInterest;
      await loan.save();
    }

    return res.status(200).json({
      success: true,
      loan,
    });
  } catch (error) {
    console.error("Error fetching loan details:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching loan details",
      error: error.message,
    });
  }
};

// ─── 11. Record Received Payment on a Loan (Instantly updates ledger & schedule) ───
exports.recordLoanPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const lenderId = req.user._id;
    const { paymentAmount, paymentMode, transactionReference, paymentDate, notes, paymentProof } =
      req.body;

    if (!paymentAmount || Number(paymentAmount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Please specify a valid payment amount greater than 0.",
      });
    }

    const loan = await Loan.findOne({ _id: id, lenderId });
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan not found or unauthorized.",
      });
    }

    if (loan.status === "closed" || (loan.remainingAmount !== undefined && loan.remainingAmount <= 0)) {
      return res.status(400).json({
        success: false,
        message: "This loan facility is already fully paid and settled. No further payments can be recorded.",
      });
    }

    const updatedLoan = allocatePaymentToLoan({
      loan,
      paymentAmount: Number(paymentAmount),
      paymentMode: paymentMode || "online",
      transactionReference: transactionReference || `TXN-${Date.now().toString().slice(-8)}`,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      notes: notes || "Payment received and recorded by lender",
      paymentProof: paymentProof || null,
      recordedBy: lenderId,
    });

    await updatedLoan.save();

    // Send in-app notification to borrower
    if (loan.borrowerId) {
      const lender = await User.findById(lenderId);
      const lenderName = lender?.companyName || lender?.userName || "Lender";

      await Notification.create({
        userId: loan.borrowerId,
        title: "Payment Confirmed! 💳",
        message: `${lenderName} recorded a payment of ₹${Number(paymentAmount).toLocaleString(
          "en-IN"
        )} for loan (${loan.dealName || loan.purpose}). Remaining Balance: ₹${Number(
          updatedLoan.remainingAmount
        ).toLocaleString("en-IN")}.`,
        type: "loan_payment_confirmed",
        metadata: {
          loanId: loan._id,
          amount: Number(paymentAmount),
          remainingAmount: updatedLoan.remainingAmount,
          transactionReference,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Payment of ₹${Number(paymentAmount).toLocaleString("en-IN")} recorded successfully!`,
      loan: updatedLoan,
    });
  } catch (error) {
    console.error("Error recording loan payment:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while recording payment",
      error: error.message,
    });
  }
};

// ─── 12. Recalculate / Customize Repayment Schedule ───
exports.recalculateLoanSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const lenderId = req.user._id;
    const { annualInterestRate, tenureMonths, repaymentType, calculationMethod, firstDueDate } =
      req.body;

    const loan = await Loan.findOne({ _id: id, lenderId });
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan not found or unauthorized.",
      });
    }

    // Only allow schedule customization if no payments recorded yet or if adjusting forward
    const scheduleData = generateRepaymentSchedule({
      principal: loan.amount,
      annualInterestRate: Number(annualInterestRate) || loan.interestRate || 12,
      tenureMonths: Number(tenureMonths) || loan.tenureMonths || 12,
      repaymentType: repaymentType || loan.repaymentType || "installment",
      calculationMethod: calculationMethod || loan.repaymentMethod || "reducing",
      startDate: loan.loanStartDate || new Date(),
      firstDueDate: firstDueDate || null,
    });

    loan.repaymentType = scheduleData.repaymentType;
    loan.repaymentMethod = scheduleData.calculationMethod;
    loan.interestRate = scheduleData.annualInterestRate;
    loan.tenureMonths = scheduleData.tenureMonths;
    loan.monthlyEmi = scheduleData.monthlyEmi;
    loan.totalRepaymentExpected = scheduleData.totalRepayment;
    loan.totalInterestExpected = scheduleData.totalInterest;
    loan.remainingAmount = Math.max(0, scheduleData.totalRepayment - (loan.totalPaid || 0));
    loan.installments = scheduleData.installments;
    loan.installmentPlan.totalInstallments = scheduleData.installments.length;
    loan.installmentPlan.installmentAmount =
      scheduleData.monthlyEmi || scheduleData.totalRepayment;
    loan.installmentPlan.nextDueDate = scheduleData.installments[0]?.dueDate || null;
    loan.loanEndDate = scheduleData.maturityDate;

    await loan.save();

    return res.status(200).json({
      success: true,
      message: "Repayment structure and schedule recalculated successfully.",
      loan,
    });
  } catch (error) {
    console.error("Error recalculating loan schedule:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while recalculating repayment schedule",
      error: error.message,
    });
  }
};

// ─── 13. Get Lender In-App Notifications ───
exports.getLenderNotifications = async (req, res) => {
  try {
    const lenderId = req.user._id;

    const notifications = await Notification.find({ userId: lenderId })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      userId: lenderId,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error("Error fetching lender notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching notifications",
      error: error.message,
    });
  }
};

// ─── 14. Mark Lender Notification as Read ───
exports.markLenderNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const lenderId = req.user._id;

    if (id === "all") {
      await Notification.updateMany({ userId: lenderId, isRead: false }, { isRead: true });
      return res.status(200).json({ success: true, message: "All notifications marked as read." });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: lenderId },
      { isRead: true },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error("Error marking notification read:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating notification",
      error: error.message,
    });
  }
};
