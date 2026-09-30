const User = require("../../models/User");
const LoanApplication = require("../../models/LoanApplication");
const Notification = require("../../models/Notification");
const Loan = require("../../models/Loan");

// ─── 1. Get Connected Borrowers (ONLY borrowers connected to this particular lender) ───
exports.getAvailableBorrowers = async (req, res) => {
  try {
    const lenderId = req.user._id;
    const { search, minCreditScore, maxCreditScore, businessType, riskGrade } = req.query;

    // 1. Find all distinct borrower IDs connected to this specific lender
    const appBorrowerIds = await LoanApplication.distinct("borrowerId", { lenderId });
    const legacyBorrowerIds = await Loan.distinct("borrowerId", { lenderId });

    // Combine all connected borrower IDs
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

    // Fetch latest application status for each connected borrower with this lender
    const borrowersWithLenderContext = await Promise.all(
      rawBorrowers.map(async (b) => {
        const latestApp = await LoanApplication.findOne({
          borrowerId: b._id,
          lenderId,
        }).sort({ createdAt: -1 });

        return {
          ...b.toObject(),
          connectionSummary: {
            latestStatus: latestApp ? latestApp.status : "connected",
            latestAmount: latestApp ? latestApp.amount : null,
            latestPurpose: latestApp ? latestApp.purpose : null,
            appliedAt: latestApp ? latestApp.createdAt : null,
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
      "userName email mobileNo address panCardNumber aadharCardNo companyName borrowerProfile createdAt"
    );

    if (!borrower) {
      return res.status(404).json({
        success: false,
        message: "Borrower not found",
      });
    }

    // Get applications this borrower sent to this specific lender
    const historyWithLender = await LoanApplication.find({
      borrowerId: id,
      lenderId: req.user._id,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      borrower,
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
    const { id } = req.params;
    const lenderId = req.user._id;

    const request = await LoanApplication.findOne({ _id: id, lenderId }).populate(
      "borrowerId",
      "userName email mobileNo altMobileNo address city taluka district state pincode aadharCardNo panCardNumber companyName borrowerProfile profileImage createdAt"
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Loan request not found or unauthorized.",
      });
    }

    return res.status(200).json({
      success: true,
      request,
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

    const lender = await User.findById(lenderId);
    const lenderName = lender?.companyName || lender?.userName || "Institutional Lender";

    // 1. Mark target application as accepted
    targetApplication.status = "accepted";
    targetApplication.acceptedAt = new Date();
    targetApplication.actionTakenAt = new Date();
    await targetApplication.save();

    // 2. ATOMIC AUTO-REJECTION of ALL other pending applications for this borrower
    const autoRejectQuery = {
      borrowerId: targetApplication.borrowerId,
      _id: { $ne: targetApplication._id },
      status: "pending",
    };

    if (targetApplication.applicationGroupId) {
      autoRejectQuery.applicationGroupId = targetApplication.applicationGroupId;
    }

    const autoRejectedResult = await LoanApplication.updateMany(autoRejectQuery, {
      $set: {
        status: "auto_rejected",
        rejectionReason: `Automatically closed because your application was accepted by ${lenderName}.`,
        actionTakenAt: new Date(),
      },
    });

    const autoRejectedCount = autoRejectedResult.modifiedCount || 0;

    // 3. Update Lender stats
    if (lender) {
      lender.lenderProfile = {
        ...lender.lenderProfile,
        totalLoansFunded: (lender.lenderProfile?.totalLoansFunded || 0) + 1,
        totalDisbursedAmount:
          (lender.lenderProfile?.totalDisbursedAmount || 0) + targetApplication.amount,
      };
      await lender.save();
    }

    // 4. Update Borrower stats
    await User.findByIdAndUpdate(targetApplication.borrowerId, {
      $inc: { "borrowerProfile.totalLoansTaken": 1 },
    });

    // 5. Create In-App Notifications for the Borrower
    const notificationsToCreate = [
      {
        userId: targetApplication.borrowerId,
        title: "Loan Application Accepted! 🎉",
        message: `Great news! ${lenderName} has accepted your loan request of ₹${targetApplication.amount.toLocaleString(
          "en-IN"
        )} (${targetApplication.purpose}).`,
        type: "loan_accepted",
        metadata: {
          applicationId: targetApplication._id,
          applicationGroupId: targetApplication.applicationGroupId,
          amount: targetApplication.amount,
          lenderName,
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
      )}.`,
      application: targetApplication,
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

    // Count of distinct connected borrowers for this specific lender
    const appBorrowerIds = await LoanApplication.distinct("borrowerId", { lenderId });
    const legacyBorrowerIds = await Loan.distinct("borrowerId", { lenderId });
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
