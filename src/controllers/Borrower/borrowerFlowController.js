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

// ─── 3. Submit Loan Application to Selected Lenders (Max 8 Lenders) ───
exports.submitLoanApplications = async (req, res) => {
  try {
    const borrowerId = req.user._id;
    const {
      lenderIds,
      amount,
      purpose,
      tenureMonths,
      requestedRate,
      notes,
    } = req.body;

    // Validate selected lenders count (Max 8)
    if (!Array.isArray(lenderIds) || lenderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least 1 lender to submit your application.",
      });
    }

    if (lenderIds.length > 8) {
      return res.status(400).json({
        success: false,
        message: "A borrower can apply to a maximum of 8 lenders at the same time.",
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
      creditScore: borrower.borrowerProfile?.creditScore || 750,
      riskGrade: borrower.borrowerProfile?.riskGrade || "A",
      gstNumber: borrower.borrowerProfile?.gstNumber || "",
      yearsInBusiness: borrower.borrowerProfile?.yearsInBusiness || 3,
      totalLoansTaken: borrower.borrowerProfile?.totalLoansTaken || 0,
      onTimeRepayments: borrower.borrowerProfile?.onTimeRepayments || 0,
      defaultsCount: borrower.borrowerProfile?.defaultsCount || 0,
    };

    // Verify all selected lenders exist, are active, and have an active subscription plan
    const now = new Date();
    const validLenders = await User.find({
      _id: { $in: lenderIds },
      roleId: 1,
      isActive: true,
      currentPlanId: { $ne: null },
      planExpiryDate: { $gt: now },
    });

    if (validLenders.length !== lenderIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more selected lenders are invalid, unverified, or do not have an active subscription.",
      });
    }

    // Generate a unique batch / group ID for this submission
    const applicationGroupId = `GRP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Create applications and notifications for each lender
    const createdApplications = [];
    const notificationsToInsert = [];

    for (const lender of validLenders) {
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
      createdApplications.push(application);

      // Notification for lender
      notificationsToInsert.push({
        userId: lender._id,
        title: "New Loan Application Received",
        message: `New application of ₹${Number(amount).toLocaleString("en-IN")} received from ${borrower.userName} for ${purpose || "Working Capital"}.`,
        type: "loan_received",
        metadata: {
          applicationId: application._id,
          applicationGroupId,
          amount: Number(amount),
          borrowerName: borrower.userName,
        },
      });
    }

    if (notificationsToInsert.length > 0) {
      await Notification.insertMany(notificationsToInsert);
    }

    return res.status(201).json({
      success: true,
      message: `Your loan application has been successfully dispatched to ${createdApplications.length} lender(s).`,
      applicationGroupId,
      applicationsCount: createdApplications.length,
      applications: createdApplications,
    });
  } catch (error) {
    console.error("Error submitting loan applications:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while submitting loan applications",
      error: error.message,
    });
  }
};

// ─── 4. Get Borrower's Submitted Applications ───
exports.getMyApplications = async (req, res) => {
  try {
    const borrowerId = req.user._id;

    const applications = await LoanApplication.find({ borrowerId })
      .populate("lenderId", "userName email mobileNo profileImage companyName lenderProfile")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: applications.length,
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
      "userName email mobileNo altMobileNo address city taluka district state pincode stateOfOperation panCardNumber aadharCardNo companyName borrowerProfile createdAt"
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

    user.borrowerProfile = {
      ...user.borrowerProfile,
      businessName: businessName !== undefined ? businessName : user.borrowerProfile?.businessName || companyName || userName,
      businessType: businessType || user.borrowerProfile?.businessType,
      annualRevenue: annualRevenue !== undefined ? Number(annualRevenue) : user.borrowerProfile?.annualRevenue,
      monthlyIncome: monthlyIncome !== undefined ? Number(monthlyIncome) : user.borrowerProfile?.monthlyIncome,
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

// ─── 8. Borrower Dashboard Overview Stats ───
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
