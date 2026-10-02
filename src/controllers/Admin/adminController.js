const Plan = require("../../models/Plan");
const User = require("../../models/User");
const Loan = require("../../models/Loan");
const SubscriptionHistory = require("../../models/SubscriptionHistory");
const jwt = require("jsonwebtoken");
const paginateQuery = require("../../utils/pagination");


// Admin: Get all borrowers who took loan from a specific lender
const getBorrowersByLender = async (req, res) => {
  try{
    const {lenderId} = req.params;
    const {page = 1, limit = 10, search, status} = req.query;
  
    //verify lender exists
    const lender = await User.findOne({_id: lenderId, roleId: 1})
    .select("userName email mobileNo profileImage");

    if(lender) {
      console.log('Lender details:', {
        _id: lender._id,
        userName: lender.userName,
        roleId: 1 // confirmed
      });
    } else {
      // Also check if user exists but wrong role
      const anyUser = await User.findById(lenderId).select('roleId userName');
    }

    if(!lender) {
      return res.status(404).json({
        success: false,
        message: "Lender not found",
      });
    }

    //build query to find loans by lender
    const query = {lenderId};
    if(status) query.paymentStatus = status; // filter by payment status if provided

    if(search){
      query.$or = [
        {name : {$regex: search, $options: "i"}},
        {aadhaarNumber : {$regex: search, $options: "i"}},
      ];
    }

    //get all loans by these lender
    const skip = (page -1) * limit;

    const loans = await Loan.find(query)
    .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .select("name aadhaarNumber mobileNumber amount paymentStatus borrowerAcceptanceStatus loanGivenDate loanEndDate remainingAmount totalPaid")

      .lean();

    const totalLoans = await Loan.countDocuments(query);

    //group by borrower: because one borrowers to has multiple loans
    const borrowerMap = {};
    loans.forEach((loan) => {
      const key =  loan.aadhaarNumber;
       if (!borrowerMap[key]) {
        borrowerMap[key] ={
          aadhaarNumber: loan.aadhaarNumber,
          borrowerName: loan.name,
          email: "N/A",
          mobileNo: loan.mobileNumber || "N/A",
          profileImage: null,
          borrowerId: null,
          loans: [],
          totalLoansCount: 0,
          totalLoanAmount: 0,
          totalPaidAmount: 0,
          totalRemainingAmount: 0,
          hasActiveLoan: false,
          hasOverdueLoan: false,
        };
       }

       borrowerMap[key].loans.push({
        loanId: loan._id,
        amount: loan.amount,
        paymentStatus: loan.paymentStatus,
        borrowerAcceptanceStatus: loan.borrowerAcceptanceStatus,
        loanGivenDate: loan.loanGivenDate,
        loanEndDate: loan.loanEndDate,
        remainigAmount: loan.remainingAmount, 
        totalPaid: loan.totalPaid,
       });

        borrowerMap[key].totalLoansCount += 1;
        borrowerMap[key].totalLoanAmount += loan.amount || 0;
        borrowerMap[key].totalPaidAmount += loan.totalPaid || 0;
        borrowerMap[key].totalRemainingAmount += loan.remainingAmount || 0;

      if (loan.paymentStatus === "pending" || loan.paymentStatus === "part paid") {
        borrowerMap[key].hasActiveLoan = true;
      }
      if (loan.paymentStatus === "overdue") {
        borrowerMap[key].hasOverdueLoan = true;
      }
    });

    const borrowers = Object.values(borrowerMap);

     //summary stats
     const allLoans = await Loan.find({ lenderId }).lean();
     const summary = {
     totalUniqueBorrowers: Object.keys(borrowerMap).length,
      totalLoans: allLoans.length,
      totalLoanAmount: allLoans.reduce((s, l) => s + (l.amount || 0), 0),
      totalPaidAmount: allLoans.reduce((s, l) => s + (l.totalPaid || 0), 0),
      totalRemainingAmount: allLoans.reduce((s, l) => s + (l.remainingAmount || 0), 0),
      activeLoans: allLoans.filter(l => l.paymentStatus === "pending" || l.paymentStatus === "part paid").length,
      paidLoans: allLoans.filter(l => l.paymentStatus === "paid").length,
      overdueLoans: allLoans.filter(l => l.paymentStatus === "overdue").length,
     };

     return res.status(200).json({
      success: true,
      message: "Borrowers fetched successfully",
      lender: {
         _id: lender._id,
        userName: lender.userName,
        email: lender.email,
        mobileNo: lender.mobileNo,
        profileImage: lender.profileImage,
      },
       summary,
      count: borrowers.length,
      data: borrowers,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalLoans / limit),
        totalItems: totalLoans,
        itemsPerPage: Number(limit),
      },
     })

  }catch(error){
    console.error("error fetching borrowers by lender:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
}


//impersonate API
// impersonate API
const impersonateLender = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { lenderId } = req.params;

    // Verify admin
    const admin = await User.findById(adminId).select("roleId userName");
    if (!admin || admin.roleId !== 0) {
      return res.status(403).json({
        success: false,
        message: "Only admins can impersonate"
      });
    }

    const lender = await User.findOne({ _id: lenderId, roleId: 1 })
      .select("_id userName email mobileNo roleId profileImage");

    if (!lender) {
      return res.status(404).json({
        success: false,
        message: "Lender not found",
      });
    }

    // ✅ IMPORTANT: Token mein saari claims sahi se bhejo
    const impersonateToken = jwt.sign(
      {
        id: lender._id,
        roleId: lender.roleId,           // ← Lender ka roleId (1)
        isImpersonating: true,           // ← Yeh zaroori hai
        adminId: adminId,                // ← Original admin ID
        adminName: admin.userName,
      },
      process.env.JWT_SECRET || "LoanManagement",
      { expiresIn: "8h" }
    );

    return res.status(200).json({
      success: true,
      message: `Impersonating ${lender.userName}`,
      data: {
        impersonateToken,
        lender: {
          _id: lender._id,
          userName: lender.userName,
          email: lender.email,
          mobileNo: lender.mobileNo,
          roleId: lender.roleId,
          profileImage: lender.profileImage,
        },
        adminId,
        adminName: admin.userName,
        expiresIn: "8h",
      },
    });
  } catch (error) {
    console.error("error in impersonateLender:", error);
    return res.status(500).json({
      success: false,
      message: "server error",
      error: error.message,
    });
  }
};


// Helper: Standard 4 Duration-based Recharge Packs
const STANDARD_DURATION_PLANS = [
  {
    planName: "1 Month Plan",
    description: "Full unrestricted platform access for 30 days. All underwriting and borrower services included.",
    duration: "1 month",
    durationDays: 30,
    price: 1999,
    priceMonthly: 1999,
    tag: "Standard Monthly",
    tier: "starter",
    allServicesIncluded: true,
    isActive: true,
  },
  {
    planName: "3 Months Plan",
    description: "90 days uninterrupted deal flow with quarterly savings. All platform services included.",
    duration: "3 months",
    durationDays: 90,
    price: 4999,
    priceMonthly: 1666,
    tag: "Quarterly Saver • Save 16%",
    tier: "quarterly",
    allServicesIncluded: true,
    isActive: true,
  },
  {
    planName: "6 Months Plan",
    description: "180 days high-velocity deal access with half-yearly savings. All premium underwriting tools included.",
    duration: "6 months",
    durationDays: 180,
    price: 8999,
    priceMonthly: 1499,
    tag: "Most Popular • Save 25%",
    tier: "half-yearly",
    allServicesIncluded: true,
    isActive: true,
  },
  {
    planName: "1 Year Plan",
    description: "365 days complete peace of mind with maximum annual savings. Full unrestricted capabilities.",
    duration: "1 year",
    durationDays: 365,
    price: 14999,
    priceMonthly: 1249,
    tag: "Best Value • Save 37%",
    tier: "annual",
    allServicesIncluded: true,
    isActive: true,
  },
];

const seedInitialDurationPlans = async () => {
  try {
    const count = await Plan.countDocuments({ isDeleted: false });
    if (count === 0) {
      await Plan.insertMany(STANDARD_DURATION_PLANS);
    }
  } catch (err) {
    console.error("Error auto-seeding initial duration plans:", err);
  }
};

// Create a new plan (Admin only)
const createPlan = async (req, res) => {
  try {
    const {
      planName,
      description,
      duration,
      durationDays,
      price,
      priceMonthly,
      tag,
      allServicesIncluded,
      servicesList,
      planFeatures,
      tier,
      isActive,
    } = req.body;

    // Validate required fields
    if (!planName || (!price && !priceMonthly) || !duration) {
      return res.status(400).json({
        success: false,
        message: "Plan name, duration, and price are required fields",
      });
    }

    // Determine durationDays
    let days = Number(durationDays);
    if (!days || isNaN(days)) {
      if (duration === "1 month") days = 30;
      else if (duration === "2 months") days = 60;
      else if (duration === "3 months") days = 90;
      else if (duration === "6 months") days = 180;
      else if (duration === "1 year") days = 365;
      else days = 30;
    }

    // Determine totalPrice and monthlyPrice
    const totalPrice = price ? Number(price) : Number(priceMonthly) * (days / 30);
    const monthlyRate = priceMonthly ? Number(priceMonthly) : Math.round(totalPrice / (days / 30));

    // Create new plan
    const newPlan = new Plan({
      planName: planName.trim(),
      description: description || "",
      duration,
      durationDays: days,
      price: totalPrice,
      priceMonthly: monthlyRate,
      tag: tag || "",
      allServicesIncluded: allServicesIncluded !== undefined ? allServicesIncluded : true,
      servicesList: Array.isArray(servicesList) && servicesList.length > 0 ? servicesList : undefined,
      planFeatures: {
        unlimitedLoans: true,
        advancedAnalytics: true,
        prioritySupport: true,
        maxActiveDeals: Number(planFeatures?.maxActiveDeals) || 100,
        aiDocumentReviewCredits: Number(planFeatures?.aiDocumentReviewCredits) || 500,
        customTermSheets: planFeatures?.customTermSheets ?? true,
        teamMembersLimit: Number(planFeatures?.teamMembersLimit) || 10,
      },
      tier: tier || "starter",
      isActive: isActive !== undefined ? isActive : true,
    });

    await newPlan.save();

    return res.status(201).json({
      success: true,
      message: "Recharge plan created successfully",
      data: newPlan,
    });
  } catch (error) {
    console.error("Error creating plan:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating plan",
      error: error.message,
    });
  }
};

// Edit/Update an existing plan (Admin only)
const editPlan = async (req, res) => {
  try {
    const planId = req.params.id;
    const {
      planName,
      description,
      duration,
      durationDays,
      price,
      priceMonthly,
      tag,
      allServicesIncluded,
      servicesList,
      planFeatures,
      tier,
      isActive,
    } = req.body;

    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    const updateData = {};

    if (planName !== undefined) updateData.planName = planName.trim();
    if (description !== undefined) updateData.description = description;
    if (duration !== undefined) updateData.duration = duration;

    if (durationDays !== undefined) {
      updateData.durationDays = Number(durationDays);
    } else if (duration !== undefined) {
      if (duration === "1 month") updateData.durationDays = 30;
      else if (duration === "2 months") updateData.durationDays = 60;
      else if (duration === "3 months") updateData.durationDays = 90;
      else if (duration === "6 months") updateData.durationDays = 180;
      else if (duration === "1 year") updateData.durationDays = 365;
    }

    const effectiveDays = updateData.durationDays || plan.durationDays || 30;

    if (price !== undefined) {
      updateData.price = Number(price);
      if (priceMonthly === undefined) {
        updateData.priceMonthly = Math.round(Number(price) / (effectiveDays / 30));
      }
    }

    if (priceMonthly !== undefined) {
      updateData.priceMonthly = Number(priceMonthly);
      if (price === undefined) {
        updateData.price = Math.round(Number(priceMonthly) * (effectiveDays / 30));
      }
    }

    if (tag !== undefined) updateData.tag = tag;
    if (allServicesIncluded !== undefined) updateData.allServicesIncluded = allServicesIncluded;
    if (servicesList !== undefined) updateData.servicesList = servicesList;
    if (tier !== undefined) updateData.tier = tier;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (planFeatures !== undefined) {
      updateData.planFeatures = {
        ...plan.planFeatures,
        ...planFeatures,
      };
    }

    const updatedPlan = await Plan.findByIdAndUpdate(planId, updateData, { new: true, runValidators: true });

    return res.status(200).json({
      success: true,
      message: "Plan updated successfully",
      data: updatedPlan,
    });
  } catch (error) {
    console.error("Error updating plan:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating plan",
      error: error.message,
    });
  }
};

// Soft delete a plan (Admin only)
const deletePlan = async (req, res) => {
  try {
    const planId = req.params.id;

    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    if (plan.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Plan is already deleted",
      });
    }

    // Check if active lenders use it
    const activeLendersWithPlan = await User.findOne({
      roleId: 1,
      currentPlanId: planId,
      planExpiryDate: { $gt: new Date() }
    });

    if (activeLendersWithPlan) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete plan because active lenders are currently subscribed to it.",
      });
    }

    plan.isDeleted = true;
    plan.isActive = false;
    plan.deletedAt = new Date();
    await plan.save();

    return res.status(200).json({
      success: true,
      message: "Plan deleted successfully",
      data: plan,
    });
  } catch (error) {
    console.error("Error deleting plan:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting plan",
      error: error.message,
    });
  }
};

// Get all plans (Admin only)
const getAllPlans = async (req, res) => {
  try {
    await seedInitialDurationPlans();

    const { isActive, duration, sortBy = "durationDays", sortOrder = "asc", includeDeleted } = req.query;

    const query = { isDeleted: false };
    if (includeDeleted === "true") {
      delete query.isDeleted;
    }
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }
    if (duration) {
      query.duration = duration;
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const plans = await Plan.find(query).sort(sort).lean();

    const formattedPlans = plans.map((p) => ({
      ...p,
      price: p.price || p.priceMonthly || 1999,
      priceMonthly: p.priceMonthly || p.price || 1999,
      durationDays: p.durationDays || (p.duration === "1 year" ? 365 : p.duration === "6 months" ? 180 : p.duration === "3 months" ? 90 : 30),
      allServicesIncluded: p.allServicesIncluded ?? true,
    }));

    return res.status(200).json({
      success: true,
      message: "Plans fetched successfully",
      count: formattedPlans.length,
      data: formattedPlans,
    });
  } catch (error) {
    console.error("Error fetching plans:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching plans",
      error: error.message,
    });
  }
};

// Get all active plans (for Lenders & Public)
const getActivePlans = async (req, res) => {
  try {
    await seedInitialDurationPlans();

    const { duration, sortBy = "durationDays", sortOrder = "asc" } = req.query;

    const query = { 
      isActive: true,
      isDeleted: false 
    };
    if (duration) {
      query.duration = duration;
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const plans = await Plan.find(query).sort(sort).lean();

    const formattedPlans = plans.map((p) => ({
      ...p,
      price: p.price || p.priceMonthly || 1999,
      priceMonthly: p.priceMonthly || p.price || 1999,
      durationDays: p.durationDays || (p.duration === "1 year" ? 365 : p.duration === "6 months" ? 180 : p.duration === "3 months" ? 90 : 30),
      allServicesIncluded: p.allServicesIncluded ?? true,
    }));

    return res.status(200).json({
      success: true,
      message: "Active plans fetched successfully",
      count: formattedPlans.length,
      data: formattedPlans,
    });
  } catch (error) {
    console.error("Error fetching active plans:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get a single plan by ID
const getPlanById = async (req, res) => {
  try {
    const planId = req.params.id;
    const { includeDeleted } = req.query;

    const query = { _id: planId };
    
    // Only filter out deleted plans if includeDeleted is not true
    if (includeDeleted !== "true") {
      query.isDeleted = false;
    }

    const plan = await Plan.findOne(query).lean();

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    // Format response data
    const responseData = {
      _id: plan._id,
      planName: plan.planName,
      description: plan.description,
      duration: plan.duration,
      priceMonthly: plan.priceMonthly,
      planFeatures: {
        unlimitedLoans: plan.planFeatures?.unlimitedLoans ?? true,
        advancedAnalytics: plan.planFeatures?.advancedAnalytics ?? false,
        prioritySupport: plan.planFeatures?.prioritySupport ?? false,
      },
      isActive: plan.isActive,
      isDeleted: plan.isDeleted,
      deletedAt: plan.deletedAt,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };

    return res.status(200).json({
      success: true,
      message: "Plan fetched successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Error fetching plan:", error);

    // Handle invalid ObjectId
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid plan ID",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get all lenders with plan purchase details and history
const getLendersWithPlans = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      planStatus, // 'active', 'expired', 'all'
      sortBy = "planPurchaseDate", 
      sortOrder = "desc",
      lenderId: queryLenderId
    } = req.query;
    const lenderId = req.params.lenderId || queryLenderId;

    // Build query - all lenders (roleId: 1)
    const query = {
      roleId: 1,
    };

    if (lenderId) {
      query._id = lenderId;
    }

    const now = new Date();
    
    // Add plan status filter (active/expired)
    if (planStatus && planStatus !== "all") {
      if (planStatus === "active") {
        query.currentPlanId = { $exists: true, $ne: null };
        query.planExpiryDate = { $gt: now };
      } else if (planStatus === "expired") {
        query.$or = [
          { currentPlanId: null },
          { currentPlanId: { $exists: false } },
          { planExpiryDate: { $lte: now } },
          { planExpiryDate: null },
        ];
      }
    }

    // Add search filter (by name, email, mobile, aadhar)
    if (search && search.trim() !== "") {
      const searchTerm = search.trim();
      const searchConditions = {
        $or: [
          { userName: { $regex: searchTerm, $options: "i" } },
          { email: { $regex: searchTerm, $options: "i" } },
          { mobileNo: { $regex: searchTerm, $options: "i" } },
          { aadharCardNo: searchTerm },
        ],
      };
      
      if (query.$or && planStatus === "expired") {
        const expiredCondition = { $or: query.$or };
        delete query.$or;
        query.$and = [
          expiredCondition,
          searchConditions,
        ];
      } else {
        query.$or = searchConditions.$or;
      }
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Options for paginateQuery with population
    const options = {
      sort,
      populate: [
        {
          path: "currentPlanId",
          select: "planName description duration durationDays price priceMonthly tag allServicesIncluded planFeatures isActive",
        },
      ],
      select: "-password -deviceTokens -fraudDetection",
    };

    // Get paginated results
    const { data: lenders, pagination } = await paginateQuery(
      User,
      query,
      page,
      limit,
      options
    );

    // Fetch live loan statistics for lenders
    const lenderIds = lenders.map((l) => l._id);
    const allLenderLoans = await Loan.find({ lenderId: { $in: lenderIds } })
      .select("lenderId amount paymentStatus remainingAmount totalPaid")
      .lean();

    const loansByLender = {};
    allLenderLoans.forEach((loan) => {
      const idStr = loan.lenderId?.toString();
      if (!idStr) return;
      if (!loansByLender[idStr]) {
        loansByLender[idStr] = {
          totalLoans: 0,
          totalAmount: 0,
          totalPaid: 0,
          totalRemaining: 0,
          activeLoans: 0,
          paidLoans: 0,
          overdueLoans: 0,
        };
      }
      loansByLender[idStr].totalLoans += 1;
      loansByLender[idStr].totalAmount += (loan.amount || 0);
      loansByLender[idStr].totalPaid += (loan.totalPaid || 0);
      loansByLender[idStr].totalRemaining += (loan.remainingAmount || 0);
      if (loan.paymentStatus === "pending" || loan.paymentStatus === "part paid") {
        loansByLender[idStr].activeLoans += 1;
      } else if (loan.paymentStatus === "paid") {
        loansByLender[idStr].paidLoans += 1;
      } else if (loan.paymentStatus === "overdue") {
        loansByLender[idStr].overdueLoans += 1;
      }
    });

    // Format response data with plan status and accurate details
    const formattedLenders = lenders.map((lender) => {
      const expiryDate = lender.planExpiryDate ? new Date(lender.planExpiryDate) : null;
      const hasPlan = Boolean(lender.currentPlanId);
      const isPlanActive = Boolean(hasPlan && expiryDate && expiryDate > now);
      const remainingDays = isPlanActive
        ? Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)))
        : 0;
      const planName = lender.currentPlanId?.planName || null;
      const planPrice = lender.currentPlanId?.price || lender.currentPlanId?.priceMonthly || 0;
      const lenderLoanStats = loansByLender[lender._id.toString()] || {
        totalLoans: 0,
        totalAmount: 0,
        totalPaid: 0,
        totalRemaining: 0,
        activeLoans: 0,
        paidLoans: 0,
        overdueLoans: 0,
      };

      return {
        lender: {
          _id: lender._id,
          userName: lender.userName,
          email: lender.email,
          mobileNo: lender.mobileNo,
          altMobileNo: lender.altMobileNo,
          profileImage: lender.profileImage,
          aadharCardNo: lender.aadharCardNo,
          panCardNumber: lender.panCardNumber,
          address: lender.address,
          city: lender.city,
          taluka: lender.taluka,
          district: lender.district,
          state: lender.state,
          pincode: lender.pincode,
          companyName: lender.companyName,
          licenseNumber: lender.licenseNumber,
          ein: lender.ein,
          isMobileVerified: lender.isMobileVerified,
          isActive: lender.isActive,
          lenderProfile: lender.lenderProfile,
          loanStats: lenderLoanStats,
          createdAt: lender.createdAt,
          updatedAt: lender.updatedAt,
          currentPlanId: lender.currentPlanId?._id || lender.currentPlanId,
          planPurchaseDate: lender.planPurchaseDate,
          planExpiryDate: lender.planExpiryDate,
        },
        currentPlan: lender.currentPlanId ? {
          _id: lender.currentPlanId._id,
          planName: lender.currentPlanId.planName,
          description: lender.currentPlanId.description,
          duration: lender.currentPlanId.duration,
          durationDays: lender.currentPlanId.durationDays,
          price: planPrice,
          priceMonthly: lender.currentPlanId.priceMonthly,
          tag: lender.currentPlanId.tag,
          allServicesIncluded: lender.currentPlanId.allServicesIncluded ?? true,
          planFeatures: lender.currentPlanId.planFeatures,
          isActive: lender.currentPlanId.isActive,
        } : null,
        planPurchaseDetails: {
          planName: planName,
          price: planPrice,
          priceMonthly: lender.currentPlanId?.priceMonthly || planPrice,
          duration: lender.currentPlanId?.duration,
          durationDays: lender.currentPlanId?.durationDays,
          purchaseDate: lender.planPurchaseDate,
          expiryDate: lender.planExpiryDate,
          planPurchaseDate: lender.planPurchaseDate,
          planExpiryDate: lender.planExpiryDate,
          razorpayOrderId: lender.razorpayOrderId,
          razorpayPaymentId: lender.razorpayPaymentId,
          isPlanActive: isPlanActive,
          remainingDays: remainingDays,
          planStatus: isPlanActive ? "active" : hasPlan ? "expired" : "no_plan",
        },
      };
    });

    return res.status(200).json({
      success: true,
      message: "Lenders directory fetched successfully",
      count: formattedLenders.length,
      data: formattedLenders,
      pagination: pagination,
    });
  } catch (error) {
    console.error("Error fetching lenders with plans:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get admin revenue statistics from plan purchases
const getAdminRevenue = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      groupBy = "all" // 'all', 'month', 'year', 'plan'
    } = req.query;

    // Get all lenders who have purchased plans
    const query = {
      roleId: 1, // Only lenders
      currentPlanId: { $exists: true, $ne: null },
      razorpayPaymentId: { $exists: true, $ne: null }, // Only successful payments
    };

    // Add date filter if provided
    if (startDate || endDate) {
      query.planPurchaseDate = {};
      if (startDate) {
        query.planPurchaseDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.planPurchaseDate.$lte = new Date(endDate);
      }
    }

    // Get all lenders with their plan details
    const lenders = await User.find(query)
      .populate("currentPlanId", "planName priceMonthly duration")
      .select("currentPlanId planPurchaseDate planExpiryDate razorpayPaymentId razorpayOrderId")
      .lean();

    // Get all plans for reference
    const allPlans = await Plan.find({}).lean();

    // Calculate revenue statistics
    let totalRevenue = 0;
    let totalPurchases = 0;
    let activePlansCount = 0;
    let expiredPlansCount = 0;
    const now = new Date();

    // Revenue by plan
    const revenueByPlan = {};
    const purchasesByPlan = {};

    // Revenue by month
    const revenueByMonth = {};
    const purchasesByMonth = {};

    // Revenue by year
    const revenueByYear = {};
    const purchasesByYear = {};

    // Plan details for each purchase
    const purchaseDetails = [];

    lenders.forEach((lender) => {
      if (!lender.currentPlanId || !lender.planPurchaseDate) return;

      const plan = lender.currentPlanId;
      const purchaseDate = new Date(lender.planPurchaseDate);
      const expiryDate = lender.planExpiryDate ? new Date(lender.planExpiryDate) : null;
      const isActive = expiryDate && expiryDate > now;
      const planPrice = plan.priceMonthly || 0;

      // Calculate total revenue
      totalRevenue += planPrice;
      totalPurchases += 1;

      // Count active/expired plans
      if (isActive) {
        activePlansCount += 1;
      } else {
        expiredPlansCount += 1;
      }

      // Revenue by plan
      const planId = plan._id.toString();
      const planName = plan.planName || "Unknown Plan";
      
      if (!revenueByPlan[planId]) {
        revenueByPlan[planId] = {
          planId: planId,
          planName: planName,
          priceMonthly: planPrice,
          duration: plan.duration || "N/A",
          totalRevenue: 0,
          totalPurchases: 0,
          activePurchases: 0,
          expiredPurchases: 0,
        };
        purchasesByPlan[planId] = [];
      }
      
      revenueByPlan[planId].totalRevenue += planPrice;
      revenueByPlan[planId].totalPurchases += 1;
      
      if (isActive) {
        revenueByPlan[planId].activePurchases += 1;
      } else {
        revenueByPlan[planId].expiredPurchases += 1;
      }

      purchasesByPlan[planId].push({
        purchaseDate: lender.planPurchaseDate,
        expiryDate: lender.planExpiryDate,
        isActive: isActive,
        paymentId: lender.razorpayPaymentId,
        orderId: lender.razorpayOrderId,
      });

      // Revenue by month
      const monthKey = `${purchaseDate.getFullYear()}-${String(purchaseDate.getMonth() + 1).padStart(2, '0')}`;
      if (!revenueByMonth[monthKey]) {
        revenueByMonth[monthKey] = {
          month: monthKey,
          year: purchaseDate.getFullYear(),
          monthNumber: purchaseDate.getMonth() + 1,
          monthName: purchaseDate.toLocaleString('default', { month: 'long' }),
          totalRevenue: 0,
          totalPurchases: 0,
        };
        purchasesByMonth[monthKey] = [];
      }
      
      revenueByMonth[monthKey].totalRevenue += planPrice;
      revenueByMonth[monthKey].totalPurchases += 1;
      purchasesByMonth[monthKey].push({
        planName: planName,
        price: planPrice,
        purchaseDate: lender.planPurchaseDate,
      });

      // Revenue by year
      const yearKey = purchaseDate.getFullYear().toString();
      if (!revenueByYear[yearKey]) {
        revenueByYear[yearKey] = {
          year: yearKey,
          totalRevenue: 0,
          totalPurchases: 0,
        };
        purchasesByYear[yearKey] = [];
      }
      
      revenueByYear[yearKey].totalRevenue += planPrice;
      revenueByYear[yearKey].totalPurchases += 1;
      purchasesByYear[yearKey].push({
        planName: planName,
        price: planPrice,
        purchaseDate: lender.planPurchaseDate,
      });

      // Purchase details
      purchaseDetails.push({
        planId: planId,
        planName: planName,
        price: planPrice,
        duration: plan.duration || "N/A",
        purchaseDate: lender.planPurchaseDate,
        expiryDate: lender.planExpiryDate,
        isActive: isActive,
        remainingDays: isActive && expiryDate 
          ? Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)))
          : 0,
        paymentId: lender.razorpayPaymentId,
        orderId: lender.razorpayOrderId,
      });
    });

    // Format response based on groupBy parameter
    let responseData = {
      summary: {
        totalRevenue: totalRevenue,
        totalPurchases: totalPurchases,
        activePlansCount: activePlansCount,
        expiredPlansCount: expiredPlansCount,
        averageRevenuePerPurchase: totalPurchases > 0 ? totalRevenue / totalPurchases : 0,
      },
      revenueByPlan: Object.values(revenueByPlan).map(plan => ({
        ...plan,
        averageRevenuePerPurchase: plan.totalPurchases > 0 
          ? plan.totalRevenue / plan.totalPurchases 
          : 0,
      })),
      revenueByMonth: Object.values(revenueByMonth).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.monthNumber - b.monthNumber;
      }),
      revenueByYear: Object.values(revenueByYear).sort((a, b) => a.year.localeCompare(b.year)),
      purchaseDetails: purchaseDetails.sort((a, b) => 
        new Date(b.purchaseDate) - new Date(a.purchaseDate)
      ),
    };

    // If groupBy is specified, return only that section
    if (groupBy !== "all") {
      const filteredData = {
        summary: responseData.summary,
      };

      if (groupBy === "plan") {
        filteredData.revenueByPlan = responseData.revenueByPlan;
      } else if (groupBy === "month") {
        filteredData.revenueByMonth = responseData.revenueByMonth;
      } else if (groupBy === "year") {
        filteredData.revenueByYear = responseData.revenueByYear;
      }

      responseData = filteredData;
    }

    return res.status(200).json({
      success: true,
      message: "Revenue statistics fetched successfully",
      data: responseData,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        groupBy: groupBy,
      },
    });
  } catch (error) {
    console.error("Error fetching revenue statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get recent activities for admin
const getRecentActivities = async (req, res) => {
  try {
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

    // 1. Get plans created by admin
    const plansCreated = await Plan.find({})
      .sort({ createdAt: -1 })
      .limit(limit * 2)
      .select('planName priceMonthly duration createdAt')
      .lean();

    plansCreated.forEach(plan => {
      activities.push({
        type: 'plan_created',
        shortMessage: 'Plan Created',
        message: `Plan "${plan.planName}" (₹${plan.priceMonthly}/month) was created`,
        planId: plan._id,
        planName: plan.planName,
        priceMonthly: plan.priceMonthly,
        duration: plan.duration,
        timestamp: plan.createdAt,
        relativeTime: getRelativeTime(plan.createdAt)
      });
    });

    // 2. Get plans updated by admin (exclude deleted plans)
    const plansUpdated = await Plan.find({ isDeleted: false, updatedAt: { $ne: null } })
      .sort({ updatedAt: -1 })
      .limit(limit * 2)
      .select('planName priceMonthly duration updatedAt createdAt')
      .lean();

    plansUpdated.forEach(plan => {
      // Only include if updated after creation
      if (plan.updatedAt && new Date(plan.updatedAt).getTime() > new Date(plan.createdAt).getTime()) {
        activities.push({
          type: 'plan_updated',
          shortMessage: 'Plan Updated',
          message: `Plan "${plan.planName}" was updated`,
          planId: plan._id,
          planName: plan.planName,
          priceMonthly: plan.priceMonthly,
          duration: plan.duration,
          timestamp: plan.updatedAt,
          relativeTime: getRelativeTime(plan.updatedAt)
        });
      }
    });

    // 3. Get plans deleted by admin
    const plansDeleted = await Plan.find({ isDeleted: true })
      .sort({ deletedAt: -1, updatedAt: -1 })
      .limit(limit * 2)
      .select('planName priceMonthly duration deletedAt updatedAt createdAt')
      .lean();

    plansDeleted.forEach(plan => {
      const deleteTime = plan.deletedAt || plan.updatedAt;
      activities.push({
        type: 'plan_deleted',
        shortMessage: 'Plan Deleted',
        message: `Plan "${plan.planName}" was deleted`,
        planId: plan._id,
        planName: plan.planName,
        priceMonthly: plan.priceMonthly,
        duration: plan.duration,
        timestamp: deleteTime,
        relativeTime: getRelativeTime(deleteTime)
      });
    });

    // 4. Get lenders who purchased subscription plans
    const planPurchases = await User.find({
      roleId: 1, // Only lenders
      currentPlanId: { $exists: true, $ne: null },
      razorpayPaymentId: { $exists: true, $ne: null }
    })
      .sort({ planPurchaseDate: -1 })
      .limit(limit * 2)
      .populate('currentPlanId', 'planName priceMonthly duration')
      .select('userName email currentPlanId planPurchaseDate razorpayPaymentId')
      .lean();

    planPurchases.forEach(user => {
      if (user.currentPlanId && user.planPurchaseDate) {
        activities.push({
          type: 'subscription_purchased',
          shortMessage: 'Subscription Purchased',
          message: `${user.userName} purchased "${user.currentPlanId.planName}" subscription (₹${user.currentPlanId.priceMonthly}/month)`,
          userId: user._id,
          userName: user.userName,
          userEmail: user.email,
          planId: user.currentPlanId._id,
          planName: user.currentPlanId.planName,
          priceMonthly: user.currentPlanId.priceMonthly,
          duration: user.currentPlanId.duration,
          paymentId: user.razorpayPaymentId,
          timestamp: user.planPurchaseDate,
          relativeTime: getRelativeTime(user.planPurchaseDate)
        });
      }
    });

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Remove duplicates and take only the most recent ones
    const uniqueActivities = [];
    const seenKeys = new Set();
    
    for (const activity of activities) {
      let key;
      if (activity.type === 'plan_updated' || activity.type === 'plan_deleted') {
        key = `${activity.type}_${activity.planId}_${activity.timestamp}`;
      } else if (activity.type === 'subscription_purchased') {
        key = `${activity.type}_${activity.userId}_${activity.planId}_${activity.timestamp}`;
      } else {
        key = `${activity.type}_${activity.planId || activity.userId}_${activity.timestamp}`;
      }
      
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

// Get a specific lender's plan purchase & subscription history (Admin only)
const getLenderSubscriptionHistory = async (req, res) => {
  try {
    const { lenderId } = req.params;

    const lender = await User.findOne({ _id: lenderId, roleId: 1 }).populate("currentPlanId");
    if (!lender) {
      return res.status(404).json({
        success: false,
        message: "Lender not found",
      });
    }

    // Fetch records from SubscriptionHistory
    let history = await SubscriptionHistory.find({ userId: lenderId })
      .populate("planId", "planName duration durationDays price priceMonthly tag")
      .sort({ purchaseDate: -1, createdAt: -1 })
      .lean();

    const now = new Date();

    // If no records in SubscriptionHistory yet, but user has an active/past plan assigned
    if (history.length === 0 && (lender.currentPlanId || lender.planPurchaseDate)) {
      const plan = lender.currentPlanId;
      const isPlanActive = lender.planExpiryDate && new Date(lender.planExpiryDate) > now;
      history = [
        {
          _id: "record_" + lender._id,
          userId: lender._id,
          planId: plan ? plan._id : null,
          planName: plan?.planName || "Basic Plan",
          duration: plan?.duration || "1 month",
          durationDays: plan?.durationDays || 30,
          price: plan?.price || plan?.priceMonthly || 0,
          priceMonthly: plan?.priceMonthly || 0,
          tag: plan?.tag || "",
          razorpayOrderId: lender.razorpayOrderId || "N/A",
          razorpayPaymentId: lender.razorpayPaymentId || "N/A",
          purchaseDate: lender.planPurchaseDate || lender.createdAt,
          startDate: lender.planPurchaseDate || lender.createdAt,
          expiryDate: lender.planExpiryDate || new Date(new Date(lender.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000),
          paymentStatus: "completed",
          isExtension: false,
          isActive: isPlanActive,
        },
      ];
    } else {
      history = history.map((item) => ({
        ...item,
        isActive: item.expiryDate && new Date(item.expiryDate) > now,
      }));
    }

    return res.status(200).json({
      success: true,
      message: "Lender subscription history fetched successfully",
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error("Error fetching lender subscription history:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching subscription history",
      error: error.message,
    });
  }
};

module.exports = {
  createPlan,
  editPlan,
  getAllPlans,
  getActivePlans,
  getPlanById,
  getLendersWithPlans,
  getAdminRevenue,
  getRecentActivities,
  deletePlan,
  getBorrowersByLender,
  impersonateLender,
  seedInitialDurationPlans,
  getLenderSubscriptionHistory,
};
