const User = require("../../models/User");
const LoanApplication = require("../../models/LoanApplication");
const Notification = require("../../models/Notification");
const Loan = require("../../models/Loan");
const Rating = require("../../models/Rating");

// ─── 1. Get Available Lenders (with interest rates, services, and history) ───
exports.getAvailableLenders = async (req, res) => {
  try {
    const { search, service, minRate, maxRate, onlyFavorites } = req.query;
    const borrowerId = req.user?._id || req.user?.id;
    const borrower = borrowerId ? await User.findById(borrowerId).select("favoriteLenders") : null;
    const favoriteLenderIds = (borrower?.favoriteLenders || []).map((id) => id.toString());

    const now = new Date();
    const query = {
      roleId: 1, // Lender role
      isActive: true,
      currentPlanId: { $ne: null },
      planExpiryDate: { $gt: now },
    };

    if (onlyFavorites === "true") {
      query._id = { $in: borrower?.favoriteLenders || [] };
    }

    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { "lenderProfile.bio": { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { state: { $regex: search, $options: "i" } },
        { stateOfOperation: { $regex: search, $options: "i" } },
      ];
    }

    if (service) {
      query["lenderProfile.servicesOffered"] = { $in: [service] };
    }

    if (minRate) {
      query["lenderProfile.minInterestRate"] = { $gte: Number(minRate) };
    }

    if (maxRate) {
      query["lenderProfile.maxInterestRate"] = { $lte: Number(maxRate) };
    }

    const rawLenders = await User.find(query)
      .select(
        "userName email mobileNo address city state stateOfOperation profileImage companyName licenseNumber lenderProfile createdAt"
      )
      .sort({ createdAt: -1 });

    const lenders = await Promise.all(
      rawLenders.map(async (l) => {
        const lp = l.lenderProfile || {};

        // 1. Calculate actual funded loans in DB
        const acceptedApps = await LoanApplication.find({
          lenderId: l._id,
          status: "accepted",
        }).select("amount");

        const fundedLoans = await Loan.find({
          lenderId: l._id,
          pipelineStage: { $in: ["approved_funded", "closed"] },
        }).select("amount");

        const totalLoansFunded =
          acceptedApps.length + fundedLoans.length + (lp.totalLoansFunded || 0);

        const totalDisbursedAmount =
          acceptedApps.reduce((acc, curr) => acc + (curr.amount || 0), 0) +
          fundedLoans.reduce((acc, curr) => acc + (curr.amount || 0), 0) +
          (lp.totalDisbursedAmount || 0);

        // 2. Calculate actual ratings from Rating model
        const userRatings = await Rating.find({ userId: l._id }).select("rating");
        let rating = 0;
        let ratingCount = 0;

        if (userRatings && userRatings.length > 0) {
          ratingCount = userRatings.length;
          const sum = userRatings.reduce((acc, r) => acc + (r.rating || 0), 0);
          rating = Number((sum / ratingCount).toFixed(1));
        } else if (lp.rating && lp.ratingCount) {
          rating = lp.rating;
          ratingCount = lp.ratingCount;
        }

        const isFavorite = favoriteLenderIds.includes(l._id.toString());

        return {
          ...l.toObject(),
          isFavorite,
          lenderProfile: {
            minInterestRate: lp.minInterestRate !== undefined ? lp.minInterestRate : null,
            maxInterestRate: lp.maxInterestRate !== undefined ? lp.maxInterestRate : null,
            servicesOffered:
              Array.isArray(lp.servicesOffered) && lp.servicesOffered.length > 0
                ? lp.servicesOffered
                : [],
            totalLoansFunded,
            totalDisbursedAmount,
            experienceYears: lp.experienceYears || 0,
            approvalRate: lp.approvalRate || 0,
            rating,
            ratingCount,
            bio: lp.bio || "",
            minLoanAmount: lp.minLoanAmount !== undefined ? lp.minLoanAmount : null,
            maxLoanAmount: lp.maxLoanAmount !== undefined ? lp.maxLoanAmount : null,
            turnaroundTime: lp.turnaroundTime || "",
          },
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: lenders.length,
      favoriteCount: favoriteLenderIds.length,
      lenders,
    });
  } catch (error) {
    console.error("Error fetching available lenders:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching lenders",
      error: error.message,
    });
  }
};

// ─── 2. Get Single Lender Profile & Track Record ───
exports.getLenderById = async (req, res) => {
  try {
    const { id } = req.params;
    const borrowerId = req.user?._id || req.user?.id;
    const borrower = borrowerId ? await User.findById(borrowerId).select("favoriteLenders") : null;
    const isFavorite = (borrower?.favoriteLenders || []).some(
      (favId) => favId.toString() === id.toString()
    );

    const now = new Date();
    const lender = await User.findOne({
      _id: id,
      roleId: 1,
      isActive: true,
      currentPlanId: { $ne: null },
      planExpiryDate: { $gt: now },
    })
      .select(
        "userName email mobileNo address city taluka district state pincode stateOfOperation profileImage companyName licenseNumber lenderProfile currentPlanId createdAt"
      )
      .populate("currentPlanId", "planName duration durationDays tag");

    if (!lender) {
      return res.status(404).json({
        success: false,
        message: "Lender not found or subscription is currently inactive.",
      });
    }

    const lp = lender.lenderProfile || {};

    const acceptedApps = await LoanApplication.find({
      lenderId: lender._id,
      status: "accepted",
    }).select("amount");

    const fundedLoans = await Loan.find({
      lenderId: lender._id,
      pipelineStage: { $in: ["approved_funded", "closed"] },
    }).select("amount");

    const totalLoansFunded =
      acceptedApps.length + fundedLoans.length + (lp.totalLoansFunded || 0);

    const totalDisbursedAmount =
      acceptedApps.reduce((acc, curr) => acc + (curr.amount || 0), 0) +
      fundedLoans.reduce((acc, curr) => acc + (curr.amount || 0), 0) +
      (lp.totalDisbursedAmount || 0);

    const userRatings = await Rating.find({ userId: lender._id }).select("rating");
    let rating = 0;
    let ratingCount = 0;

    if (userRatings && userRatings.length > 0) {
      ratingCount = userRatings.length;
      const sum = userRatings.reduce((acc, r) => acc + (r.rating || 0), 0);
      rating = Number((sum / ratingCount).toFixed(1));
    } else if (lp.rating && lp.ratingCount) {
      rating = lp.rating;
      ratingCount = lp.ratingCount;
    }

    const dynamicLender = {
      ...lender.toObject(),
      isFavorite,
      lenderProfile: {
        minInterestRate: lp.minInterestRate !== undefined ? lp.minInterestRate : null,
        maxInterestRate: lp.maxInterestRate !== undefined ? lp.maxInterestRate : null,
        servicesOffered:
          Array.isArray(lp.servicesOffered) && lp.servicesOffered.length > 0
            ? lp.servicesOffered
            : [],
        totalLoansFunded,
        totalDisbursedAmount,
        experienceYears: lp.experienceYears || 0,
        approvalRate: lp.approvalRate || 0,
        rating,
        ratingCount,
        bio: lp.bio || "",
        minLoanAmount: lp.minLoanAmount !== undefined ? lp.minLoanAmount : null,
        maxLoanAmount: lp.maxLoanAmount !== undefined ? lp.maxLoanAmount : null,
        turnaroundTime: lp.turnaroundTime || "",
      },
    };

    return res.status(200).json({
      success: true,
      lender: dynamicLender,
    });
  } catch (error) {
    console.error("Error fetching lender details:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching lender details",
      error: error.message,
    });
  }
};

// ─── Toggle Favorite Lender ───
exports.toggleFavoriteLender = async (req, res) => {
  try {
    const { lenderId } = req.params;
    const borrowerId = req.user?._id || req.user?.id;

    const now = new Date();
    const lender = await User.findOne({
      _id: lenderId,
      roleId: 1,
      isActive: true,
      currentPlanId: { $ne: null },
      planExpiryDate: { $gt: now },
    });
    if (!lender) {
      return res.status(404).json({
        success: false,
        message: "Lender not found or subscription inactive.",
      });
    }

    const borrower = await User.findById(borrowerId);
    if (!borrower) {
      return res.status(404).json({
        success: false,
        message: "Borrower account not found.",
      });
    }

    const currentFavs = (borrower.favoriteLenders || []).map((id) => id.toString());
    const isCurrentlyFav = currentFavs.includes(lenderId.toString());

    let updatedBorrower;
    let isFavorite;

    if (isCurrentlyFav) {
      updatedBorrower = await User.findByIdAndUpdate(
        borrowerId,
        { $pull: { favoriteLenders: lenderId } },
        { new: true }
      );
      isFavorite = false;
    } else {
      updatedBorrower = await User.findByIdAndUpdate(
        borrowerId,
        { $addToSet: { favoriteLenders: lenderId } },
        { new: true }
      );
      isFavorite = true;
    }

    return res.status(200).json({
      success: true,
      isFavorite,
      favoriteCount: updatedBorrower.favoriteLenders?.length || 0,
      favoriteLenders: updatedBorrower.favoriteLenders || [],
      message: isFavorite
        ? `${lender.companyName || lender.userName} added to your Favorite Lenders!`
        : `${lender.companyName || lender.userName} removed from your Favorite Lenders.`,
    });
  } catch (error) {
    console.error("Error toggling favorite lender:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating favorite lender",
      error: error.message,
    });
  }
};

// ─── Get Favorite Lenders ───
exports.getFavoriteLenders = async (req, res) => {
  try {
    req.query.onlyFavorites = "true";
    return exports.getAvailableLenders(req, res);
  } catch (error) {
    console.error("Error fetching favorite lenders:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching favorite lenders",
      error: error.message,
    });
  }
};

// Helper: Expire pending loan requests older than 48 hours
const expireOldPendingApplications = async () => {
  try {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const expiredApps = await LoanApplication.find({
      status: "pending",
      createdAt: { $lte: fortyEightHoursAgo },
    }).populate("borrowerId lenderId");

    if (expiredApps.length === 0) return 0;

    const expiredIds = expiredApps.map((a) => a._id);
    await LoanApplication.updateMany(
      { _id: { $in: expiredIds } },
      {
        $set: {
          status: "auto_rejected",
          rejectionReason: "Auto-rejected: Request expired after 48 hours without lender response.",
          actionTakenAt: new Date(),
        },
      }
    );

    const notificationsToInsert = [];
    for (const app of expiredApps) {
      const bId = app.borrowerId?._id || app.borrowerId;
      const lenderName =
        app.lenderSnapshot?.companyName ||
        app.lenderSnapshot?.userName ||
        app.lenderId?.companyName ||
        app.lenderId?.userName ||
        "the lender";

      if (bId) {
        notificationsToInsert.push({
          userId: bId,
          title: "Loan Request Auto-Expired (48h Window)",
          message: `Your loan request of ₹${Number(app.amount || 0).toLocaleString("en-IN")} to ${lenderName} has expired as no response was received within 48 hours. You are now eligible to apply with another lender.`,
          type: "loan_expired",
          metadata: {
            applicationId: app._id,
            amount: app.amount,
            lenderName,
          },
        });
      }
    }

    if (notificationsToInsert.length > 0) {
      await Notification.insertMany(notificationsToInsert).catch((err) =>
        console.error("Error inserting expiration notifications:", err)
      );
    }

    return expiredApps.length;
  } catch (err) {
    console.error("Error in expireOldPendingApplications:", err);
    return 0;
  }
};

exports.expireOldPendingApplications = expireOldPendingApplications;

// ─── 3. Submit Loan Application to 1 Selected Lender (Single Application Rule) ───
exports.submitLoanApplications = async (req, res) => {
  try {
    const borrowerId = req.user._id;
    let {
      lenderId,
      lenderIds,
      amount,
      purpose,
      tenureMonths,
      requestedRate,
      notes,
    } = req.body;

    // 1. First expire any pending requests older than 48 hours
    await expireOldPendingApplications();

    // 2. Determine target lender (ONLY 1 LENDER ALLOWED)
    let targetLenderId = lenderId;
    if (!targetLenderId && Array.isArray(lenderIds)) {
      if (lenderIds.length > 1) {
        return res.status(400).json({
          success: false,
          message: "Borrowers can only select and apply to 1 lender at a time. Please select only 1 lender.",
        });
      }
      targetLenderId = lenderIds[0];
    } else if (!targetLenderId && typeof lenderIds === "string") {
      targetLenderId = lenderIds;
    }

    if (!targetLenderId) {
      return res.status(400).json({
        success: false,
        message: "Please select 1 lender to submit your loan application.",
      });
    }

    // 3. Check if borrower already has an active pending application
    const existingPending = await LoanApplication.findOne({
      borrowerId,
      status: "pending",
    }).populate("lenderId", "userName companyName");

    if (existingPending) {
      const createdAtTime = new Date(existingPending.createdAt).getTime();
      const expiresAtTime = createdAtTime + 48 * 60 * 60 * 1000;
      const remainingMs = Math.max(0, expiresAtTime - Date.now());
      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      const lenderName =
        existingPending.lenderSnapshot?.companyName ||
        existingPending.lenderSnapshot?.userName ||
        existingPending.lenderId?.companyName ||
        existingPending.lenderId?.userName ||
        "your selected lender";

      return res.status(400).json({
        success: false,
        hasPendingApplication: true,
        pendingApplicationId: existingPending._id,
        remainingHours,
        message: `You currently have an active loan application in review with ${lenderName}. You can only apply to 1 lender at a time. If the lender rejects or does not respond within the remaining ${remainingHours} hour(s) (48h review window), you will be eligible to apply with another lender.`,
      });
    }

    if (!amount || amount < 1000) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid loan amount (minimum ₹1,000).",
      });
    }

    // Fetch Borrower Details & Snapshot
    const borrower = await User.findById(borrowerId);
    if (!borrower) {
      return res.status(404).json({
        success: false,
        message: "Borrower account not found.",
      });
    }

    // Check 100% Profile Completion Rule
    const completion = calculateBorrowerProfileCompletion(borrower);
    if (!completion.isComplete) {
      return res.status(400).json({
        success: false,
        isProfileIncomplete: true,
        percentage: completion.percentage,
        missingFields: completion.missingFields,
        message: `Your profile is only ${completion.percentage}% complete. Please complete 100% of your borrower profile (missing: ${completion.missingFields.slice(0, 3).join(", ")}${completion.missingFields.length > 3 ? "..." : ""}) before applying for a loan.`,
      });
    }

    const rawScore = Number(req.body.creditScore || borrower.borrowerProfile?.creditScore || 750);
    const appCreditScore = isNaN(rawScore) ? 750 : Math.max(300, Math.min(900, rawScore));
    const appRiskGrade = computeRiskGrade(appCreditScore);

    const borrowerSnapshot = {
      userName: borrower.userName,
      email: borrower.email,
      mobileNo: borrower.mobileNo,
      altMobileNo: borrower.altMobileNo || "",
      address: borrower.address,
      city: borrower.city || "",
      taluka: borrower.taluka || "",
      district: borrower.district || "",
      state: borrower.state || "",
      pincode: borrower.pincode || "",
      panCardNumber: borrower.panCardNumber || "",
      aadharCardNo: borrower.aadharCardNo || "",
      employmentType: borrower.borrowerProfile?.employmentType || "Business Owner / Self-Employed",
      businessName: borrower.borrowerProfile?.businessName || borrower.companyName || borrower.userName,
      businessType: borrower.borrowerProfile?.businessType || "Private Enterprise",
      annualRevenue: borrower.borrowerProfile?.annualRevenue || 0,
      monthlyIncome: borrower.borrowerProfile?.monthlyIncome || 0,
      creditScore: appCreditScore,
      riskGrade: appRiskGrade,
      gstNumber: borrower.borrowerProfile?.gstNumber || "",
      yearsInBusiness: borrower.borrowerProfile?.yearsInBusiness || 3,
      totalLoansTaken: borrower.borrowerProfile?.totalLoansTaken || 0,
      onTimeRepayments: borrower.borrowerProfile?.onTimeRepayments || 0,
      defaultsCount: borrower.borrowerProfile?.defaultsCount || 0,
    };

    // Verify selected lender exists, is active, and has active plan
    const now = new Date();
    const lender = await User.findOne({
      _id: targetLenderId,
      roleId: 1,
      isActive: true,
      currentPlanId: { $ne: null },
      planExpiryDate: { $gt: now },
    });

    if (!lender) {
      return res.status(400).json({
        success: false,
        message: "The selected lender is invalid, unverified, or does not have an active subscription.",
      });
    }

    const applicationGroupId = `APP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const lenderSnapshot = {
      userName: lender.userName,
      companyName: lender.companyName || lender.userName,
      email: lender.email,
      mobileNo: lender.mobileNo,
      minInterestRate: lender.lenderProfile?.minInterestRate || 9.5,
      maxInterestRate: lender.lenderProfile?.maxInterestRate || 14.0,
      servicesOffered: lender.lenderProfile?.servicesOffered || [],
    };

    const application = new LoanApplication({
      applicationGroupId,
      borrowerId,
      lenderId: lender._id,
      amount: Number(amount),
      purpose: purpose || "Working Capital",
      tenureMonths: Number(tenureMonths) || 12,
      requestedRate: Number(requestedRate) || lender.lenderProfile?.minInterestRate || 10.5,
      status: "pending",
      notes: notes || "",
      borrowerSnapshot,
      lenderSnapshot,
    });

    await application.save();

    // Send notification to lender
    await Notification.create({
      userId: lender._id,
      title: "New Loan Application Received",
      message: `New application of ₹${Number(amount).toLocaleString("en-IN")} received from ${borrower.userName} for ${purpose || "Working Capital"}. Response required within 48 hours.`,
      type: "loan_received",
      metadata: {
        applicationId: application._id,
        applicationGroupId,
        amount: Number(amount),
        borrowerName: borrower.userName,
      },
    });

    return res.status(201).json({
      success: true,
      message: `Your loan application has been successfully submitted to ${lender.companyName || lender.userName}. The lender has 48 hours to review.`,
      applicationGroupId,
      applicationsCount: 1,
      application,
      applications: [application],
    });
  } catch (error) {
    console.error("Error submitting loan application:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while submitting loan application",
      error: error.message,
    });
  }
};

// ─── 4. Get Borrower's Submitted Applications ───
exports.getMyApplications = async (req, res) => {
  try {
    const borrowerId = req.user._id;

    // Run expiration check for any requests older than 48 hours
    await expireOldPendingApplications();

    const rawApplications = await LoanApplication.find({ borrowerId })
      .populate("lenderId", "userName email mobileNo profileImage companyName lenderProfile")
      .sort({ createdAt: -1 });

    const applications = await Promise.all(
      rawApplications.map(async (app) => {
        let activeLoan = null;
        if (app.status === "accepted") {
          activeLoan = await Loan.findOne({ applicationId: app._id }).select(
            "_id amount interestRate tenureMonths monthlyEmi totalPaid remainingAmount paymentStatus installments installmentPlan loanStartDate loanEndDate disbursalVerification status"
          );
        }

        // Calculate 48h expiration details for pending requests
        let remainingHours = null;
        let expiresAt = null;
        if (app.status === "pending") {
          const createdAtTime = new Date(app.createdAt).getTime();
          expiresAt = new Date(createdAtTime + 48 * 60 * 60 * 1000);
          const remainingMs = Math.max(0, expiresAt.getTime() - Date.now());
          remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
        }

        return {
          ...app.toObject(),
          activeLoan,
          remainingHours,
          expiresAt,
        };
      })
    );

    const hasActivePending = applications.some((a) => a.status === "pending");

    return res.status(200).json({
      success: true,
      count: applications.length,
      hasActivePending,
      applications,
    });
  } catch (error) {
    console.error("Error fetching borrower applications:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching applications",
      error: error.message,
    });
  }
};

// ─── 5. Get Borrower In-App Notifications ───
exports.getBorrowerNotifications = async (req, res) => {
  try {
    const borrowerId = req.user._id;

    const notifications = await Notification.find({ userId: borrowerId })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      userId: borrowerId,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error("Error fetching borrower notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching notifications",
      error: error.message,
    });
  }
};

// ─── 6. Mark Notification as Read ───
exports.markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const borrowerId = req.user._id;

    if (id === "all") {
      await Notification.updateMany({ userId: borrowerId, isRead: false }, { isRead: true });
      return res.status(200).json({ success: true, message: "All notifications marked as read." });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: borrowerId },
      { isRead: true },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error("Error updating notification:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating notification",
      error: error.message,
    });
  }
};

// Helper: Compute Risk Grade based on Credit Score
const computeRiskGrade = (score) => {
  const s = Number(score) || 750;
  if (s >= 750) return "A";
  if (s >= 650) return "B";
  return "C";
};

// Helper: Calculate Borrower Profile Completion
const calculateBorrowerProfileCompletion = (user) => {
  if (!user) return { percentage: 0, isComplete: false, missingFields: [] };
  const bp = user.borrowerProfile || {};
  
  const checks = [
    { name: "Full Name", valid: Boolean(user.userName && user.userName.trim()) },
    { name: "Email Address", valid: Boolean(user.email && user.email.trim()) },
    { name: "Primary Mobile", valid: Boolean(user.mobileNo && user.mobileNo.trim()) },
    { name: "Alternative Mobile", valid: Boolean(user.altMobileNo && user.altMobileNo.trim()) },
    { name: "PAN Card Number", valid: Boolean(user.panCardNumber && user.panCardNumber.trim()) },
    { name: "Aadhaar Card Number", valid: Boolean(user.aadharCardNo && user.aadharCardNo.trim()) },
    { name: "Registered Address", valid: Boolean(user.address && user.address.trim()) },
    { name: "City / Town", valid: Boolean(user.city && user.city.trim()) },
    { name: "Taluka / Tehsil", valid: Boolean(user.taluka && user.taluka.trim()) },
    { name: "District", valid: Boolean(user.district && user.district.trim()) },
    { name: "State", valid: Boolean(user.state && user.state.trim()) },
    { name: "Pincode", valid: Boolean(user.pincode && user.pincode.trim()) },
    { name: "Source of Income / Occupation", valid: Boolean(bp.employmentType && bp.employmentType.trim()) },
    { name: "Annual Income / Turnover", valid: Boolean(bp.annualRevenue !== undefined && Number(bp.annualRevenue) > 0) },
    { name: "CIBIL / Credit Score", valid: Boolean(bp.creditScore !== undefined && Number(bp.creditScore) >= 300) },
  ];

  const completed = checks.filter((c) => c.valid).length;
  const percentage = Math.round((completed / checks.length) * 100);
  const missingFields = checks.filter((c) => !c.valid).map((c) => c.name);

  return {
    percentage,
    isComplete: percentage === 100,
    completedCount: completed,
    totalCount: checks.length,
    missingFields,
  };
};

// ─── 7. Get & Update Borrower Profile ───
exports.getBorrowerProfile = async (req, res) => {
  try {
    const borrower = await User.findById(req.user._id).select(
      "userName email mobileNo altMobileNo address city taluka district state pincode stateOfOperation panCardNumber aadharCardNo companyName borrowerProfile digilockerKyc createdAt"
    );

    if (!borrower) {
      return res.status(404).json({ success: false, message: "Borrower not found" });
    }

    const profileCompletion = calculateBorrowerProfileCompletion(borrower);

    return res.status(200).json({
      success: true,
      borrower,
      profileCompletion,
    });
  } catch (error) {
    console.error("Error fetching borrower profile:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching profile",
      error: error.message,
    });
  }
};

exports.updateBorrowerProfile = async (req, res) => {
  try {
    const {
      userName,
      altMobileNo,
      address,
      city,
      taluka,
      district,
      state,
      pincode,
      stateOfOperation,
      panCardNumber,
      aadharCardNo,
      companyName,
      businessName,
      businessType,
      annualRevenue,
      monthlyIncome,
      creditScore,
      gstNumber,
      yearsInBusiness,
      employmentType,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Borrower not found" });
    }

    if (userName !== undefined) user.userName = userName;
    if (altMobileNo !== undefined) user.altMobileNo = altMobileNo;
    if (address !== undefined) user.address = address;
    if (city !== undefined) user.city = city;
    if (taluka !== undefined) user.taluka = taluka;
    if (district !== undefined) user.district = district;
    if (state !== undefined) user.state = state;
    if (pincode !== undefined) user.pincode = pincode;
    if (stateOfOperation !== undefined) user.stateOfOperation = stateOfOperation;
    if (panCardNumber !== undefined) user.panCardNumber = panCardNumber;
    if (aadharCardNo !== undefined) user.aadharCardNo = aadharCardNo;
    if (companyName !== undefined) user.companyName = companyName;

    let newCreditScore =
      creditScore !== undefined
        ? Number(creditScore)
        : user.borrowerProfile?.creditScore !== undefined
        ? Number(user.borrowerProfile.creditScore)
        : 750;
    if (isNaN(newCreditScore) || newCreditScore < 300) newCreditScore = 300;
    if (newCreditScore > 900) newCreditScore = 900;
    const newRiskGrade = computeRiskGrade(newCreditScore);

    user.borrowerProfile = {
      ...user.borrowerProfile,
      businessName: businessName !== undefined ? businessName : user.borrowerProfile?.businessName || companyName || userName,
      businessType: businessType || user.borrowerProfile?.businessType,
      annualRevenue: annualRevenue !== undefined ? Number(annualRevenue) : user.borrowerProfile?.annualRevenue,
      monthlyIncome: monthlyIncome !== undefined ? Number(monthlyIncome) : user.borrowerProfile?.monthlyIncome,
      creditScore: newCreditScore,
      riskGrade: newRiskGrade,
      gstNumber: gstNumber !== undefined ? gstNumber : user.borrowerProfile?.gstNumber,
      yearsInBusiness: yearsInBusiness !== undefined ? Number(yearsInBusiness) : user.borrowerProfile?.yearsInBusiness,
      employmentType: employmentType || user.borrowerProfile?.employmentType,
    };

    await user.save();

    const profileCompletion = calculateBorrowerProfileCompletion(user);

    return res.status(200).json({
      success: true,
      message: "Borrower profile updated successfully",
      borrower: user,
      profileCompletion,
    });
  } catch (error) {
    console.error("Error updating borrower profile:", error);

    // Handle MongoDB duplicate key error (E11000)
    if (error.code === 11000 || error.name === "MongoServerError") {
      let duplicateField = "unique credential";
      if (error.keyPattern?.panCardNumber || (error.message && error.message.includes("panCardNumber"))) {
        duplicateField = "PAN Card Number";
      } else if (error.keyPattern?.aadharCardNo || (error.message && error.message.includes("aadharCardNo"))) {
        duplicateField = "Aadhaar Card Number";
      } else if (error.keyPattern?.mobileNo || (error.message && error.message.includes("mobileNo"))) {
        duplicateField = "Mobile Number";
      } else if (error.keyPattern?.email || (error.message && error.message.includes("email"))) {
        duplicateField = "Email Address";
      }

      return res.status(400).json({
        success: false,
        message: `This ${duplicateField} is already registered with another account. Please enter your unique ${duplicateField}.`,
        duplicateField,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while updating borrower profile",
      error: error.message,
    });
  }
};

// ─── 9. Get Borrower's Loans Portfolio & Repayment Overview ───
exports.getBorrowerLoansPortfolio = async (req, res) => {
  try {
    const borrowerId = req.user._id;
    const { status, search } = req.query;

    const query = { borrowerId };

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
        { dealName: { $regex: search, $options: "i" } },
        { purpose: { $regex: search, $options: "i" } },
      ];
    }

    const loans = await Loan.find(query)
      .populate("lenderId", "userName companyName email mobileNo profileImage lenderProfile")
      .populate("applicationId", "amount purpose requestedRate status createdAt")
      .sort({ createdAt: -1 });

    // Calculate aggregate portfolio metrics for this borrower
    const allBorrowerLoans = await Loan.find({ borrowerId }).populate(
      "lenderId",
      "userName companyName email mobileNo"
    );

    const totalBorrowed = allBorrowerLoans.reduce((sum, l) => sum + (l.amount || 0), 0);
    const totalRepaid = allBorrowerLoans.reduce((sum, l) => sum + (l.totalPaid || 0), 0);
    const totalOutstanding = allBorrowerLoans.reduce(
      (sum, l) => sum + (l.remainingAmount || 0),
      0
    );
    const totalInterest = allBorrowerLoans.reduce(
      (sum, l) => sum + (l.totalInterestExpected || 0),
      0
    );
    const activeLoansCount = allBorrowerLoans.filter((l) => l.status === "active").length;
    const closedLoansCount = allBorrowerLoans.filter(
      (l) => l.status === "closed" || l.paymentStatus === "paid"
    ).length;

    // Find next upcoming EMI across all active loans
    let nextEmi = null;
    const now = new Date();
    allBorrowerLoans.forEach((loan) => {
      if (loan.status === "active" && Array.isArray(loan.installments)) {
        loan.installments.forEach((inst) => {
          if (["pending", "overdue"].includes(inst.status)) {
            const dueDate = new Date(inst.dueDate);
            if (!nextEmi || dueDate < new Date(nextEmi.dueDate)) {
              nextEmi = {
                loanId: loan._id,
                dealName: loan.dealName || loan.purpose,
                lenderName: loan.lenderId?.companyName || loan.lenderId?.userName || "Lender",
                installmentNumber: inst.installmentNumber,
                dueDate: inst.dueDate,
                emiAmount: inst.emiAmount,
                status: inst.status,
              };
            }
          }
        });
      }
    });

    return res.status(200).json({
      success: true,
      count: loans.length,
      metrics: {
        totalBorrowed,
        totalRepaid,
        totalOutstanding,
        totalInterest,
        activeLoansCount,
        closedLoansCount,
        totalLoans: allBorrowerLoans.length,
        nextEmi,
      },
      loans,
    });
  } catch (error) {
    console.error("Error fetching borrower loans portfolio:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching borrower loans portfolio",
      error: error.message,
    });
  }
};

// ─── 10. Get Single Borrower Loan with EMI Schedule & Payment Ledger ───
exports.getBorrowerLoanById = async (req, res) => {
  try {
    const { id } = req.params;
    const borrowerId = req.user._id;

    const loan = await Loan.findOne({ _id: id, borrowerId })
      .populate(
        "lenderId",
        "userName companyName email mobileNo address city taluka district state pincode profileImage lenderProfile"
      )
      .populate("borrowerId", "userName email mobileNo address companyName borrowerProfile")
      .populate("applicationId");

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan record not found or unauthorized access",
      });
    }

    // Check for any overdue installments dynamically
    const now = new Date();
    let isModified = false;
    if (Array.isArray(loan.installments)) {
      loan.installments.forEach((inst) => {
        if (inst.status === "pending" && new Date(inst.dueDate) < now) {
          inst.status = "overdue";
          isModified = true;
        }
      });
      if (isModified) {
        await loan.save();
      }
    }

    const totalInstallments = loan.installments?.length || 0;
    const paidInstallments =
      loan.installments?.filter((inst) => inst.status === "paid").length || 0;
    const remainingInstallments = totalInstallments - paidInstallments;

    return res.status(200).json({
      success: true,
      loan,
      summary: {
        totalPrincipal: loan.amount,
        interestRate: loan.interestRate,
        monthlyEmi: loan.monthlyEmi,
        totalRepaymentExpected: loan.totalRepaymentExpected,
        totalInterestExpected: loan.totalInterestExpected,
        totalPaid: loan.totalPaid,
        remainingAmount: loan.remainingAmount,
        totalInstallments,
        paidInstallments,
        remainingInstallments,
        paymentStatus: loan.paymentStatus,
        status: loan.status,
      },
    });
  } catch (error) {
    console.error("Error fetching single borrower loan:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching loan details",
      error: error.message,
    });
  }
};

// ─── 11. Borrower Dashboard Overview Stats ───
exports.getBorrowerDashboardStats = async (req, res) => {
  try {
    const borrowerId = req.user._id;

    const totalApplications = await LoanApplication.countDocuments({ borrowerId });
    const pendingApplications = await LoanApplication.countDocuments({ borrowerId, status: "pending" });
    const acceptedApplications = await LoanApplication.countDocuments({ borrowerId, status: "accepted" });
    const autoRejectedApplications = await LoanApplication.countDocuments({ borrowerId, status: "auto_rejected" });
    const rejectedApplications = await LoanApplication.countDocuments({ borrowerId, status: "rejected" });

    const now = new Date();
    const totalLendersAvailable = await User.countDocuments({
      roleId: 1,
      isActive: true,
      currentPlanId: { $ne: null },
      planExpiryDate: { $gt: now },
    });

    // Find latest accepted loan if any
    const latestAccepted = await LoanApplication.findOne({ borrowerId, status: "accepted" })
      .populate("lenderId", "userName companyName email mobileNo lenderProfile")
      .sort({ acceptedAt: -1 });

    return res.status(200).json({
      success: true,
      stats: {
        totalApplications,
        pendingApplications,
        acceptedApplications,
        autoRejectedApplications,
        rejectedApplications,
        totalLendersAvailable,
        latestAccepted,
      },
    });
  } catch (error) {
    console.error("Error fetching borrower dashboard stats:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching stats",
      error: error.message,
    });
  }
};


