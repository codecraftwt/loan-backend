const Plan = require("../../models/Plan");
const User = require("../../models/User");
const paginateQuery = require("../../utils/pagination");

// Create a new plan (Admin only)
const createPlan = async (req, res) => {
  try {
    const {
      planName,
      description,
      duration,
      priceMonthly,
      planFeatures,
      isActive,
    } = req.body;

    // Validate required fields
    if (!planName || !priceMonthly || !duration) {
      return res.status(400).json({
        success: false,
        message: "Plan name, duration, and price are required fields",
      });
    }

    // Validate duration
    const validDurations = ["1 month", "2 months", "3 months", "6 months", "1 year"];
    if (!validDurations.includes(duration)) {
      return res.status(400).json({
        success: false,
        message: `Duration must be one of: ${validDurations.join(", ")}`,
      });
    }

    // Prepare plan features for comparison
    const newPlanFeatures = {
      unlimitedLoans: true, // All plans have unlimited loans
      advancedAnalytics: planFeatures?.advancedAnalytics || false,
      prioritySupport: planFeatures?.prioritySupport || false,
    };

    // Check if plan with same name, price, and features already exists
    const existingPlan = await Plan.findOne({ planName: planName.trim() });
    if (existingPlan) {
      const existingPrice = parseFloat(existingPlan.priceMonthly);
      const newPrice = parseFloat(priceMonthly);
      
      // Compare price
      const priceMatches = existingPrice === newPrice;
      
      // Compare features (normalize to handle undefined)
      const existingFeatures = existingPlan.planFeatures || {};
      const featuresMatch = 
        (existingFeatures.advancedAnalytics ?? false) === newPlanFeatures.advancedAnalytics &&
        (existingFeatures.prioritySupport ?? false) === newPlanFeatures.prioritySupport;

      if (priceMatches && featuresMatch) {
        return res.status(400).json({
          success: false,
          message: "Plan with all these details already exists",
        });
      }
    }

    // Create new plan
    const newPlan = new Plan({
      planName: planName.trim(),
      description: description || "",
      duration: duration,
      priceMonthly: parseFloat(priceMonthly),
      planFeatures: newPlanFeatures,
      isActive: isActive !== undefined ? isActive : true,
    });

    await newPlan.save();

    // Format response to match user's requested structure
    const responseData = {
      _id: newPlan._id,
      planName: newPlan.planName,
      description: newPlan.description,
      duration: newPlan.duration,
      priceMonthly: newPlan.priceMonthly,
      planFeatures: {
        unlimitedLoans: newPlan.planFeatures.unlimitedLoans,
        advancedAnalytics: newPlan.planFeatures.advancedAnalytics,
        prioritySupport: newPlan.planFeatures.prioritySupport,
      },
      isActive: newPlan.isActive,
      createdAt: newPlan.createdAt,
      updatedAt: newPlan.updatedAt,
    };

    return res.status(201).json({
      success: true,
      message: "Plan created successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Error creating plan:", error);

    // Handle validation errors
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

    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
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
      priceMonthly,
      planFeatures,
      isActive,
    } = req.body;

    // Find the plan
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    // Prepare update data
    const updateData = {};

    // Prepare final values for duplicate check
    let finalPlanName = plan.planName;
    let finalPrice = plan.priceMonthly;
    let finalFeatures = {
      unlimitedLoans: true,
      advancedAnalytics: plan.planFeatures?.advancedAnalytics ?? false,
      prioritySupport: plan.planFeatures?.prioritySupport ?? false,
    };

    if (planName !== undefined) {
      updateData.planName = planName.trim();
      finalPlanName = planName.trim();
    }

    if (description !== undefined) updateData.description = description;
    
    if (duration !== undefined) {
      // Validate duration
      const validDurations = ["1 month", "2 months", "3 months", "6 months", "1 year"];
      if (!validDurations.includes(duration)) {
        return res.status(400).json({
          success: false,
          message: `Duration must be one of: ${validDurations.join(", ")}`,
        });
      }
      updateData.duration = duration;
    }
    
    if (priceMonthly !== undefined) {
      updateData.priceMonthly = parseFloat(priceMonthly);
      finalPrice = parseFloat(priceMonthly);
    }

    if (isActive !== undefined) updateData.isActive = isActive;

    // Update planFeatures if provided
    if (planFeatures !== undefined) {
      updateData.planFeatures = {
        unlimitedLoans: true, // Always true for all plans
        advancedAnalytics: planFeatures.advancedAnalytics !== undefined 
          ? planFeatures.advancedAnalytics 
          : plan.planFeatures?.advancedAnalytics ?? false,
        prioritySupport: planFeatures.prioritySupport !== undefined 
          ? planFeatures.prioritySupport 
          : plan.planFeatures?.prioritySupport ?? false,
      };
      finalFeatures = updateData.planFeatures;
    }

    // Check if updated plan conflicts with existing plan (only if name, price, or features changed)
    if (updateData.planName || updateData.priceMonthly !== undefined || updateData.planFeatures) {
      const existingPlan = await Plan.findOne({ 
        planName: finalPlanName,
        _id: { $ne: planId } // Exclude current plan
      });
      
      if (existingPlan) {
        const priceMatches = parseFloat(existingPlan.priceMonthly) === parseFloat(finalPrice);
        const existingFeatures = existingPlan.planFeatures || {};
        const featuresMatch = 
          (existingFeatures.advancedAnalytics ?? false) === finalFeatures.advancedAnalytics &&
          (existingFeatures.prioritySupport ?? false) === finalFeatures.prioritySupport;

        if (priceMatches && featuresMatch) {
          return res.status(400).json({
            success: false,
            message: "Plan with all these details already exists",
          });
        }
      }
    }

    // Update the plan
    const updatedPlan = await Plan.findByIdAndUpdate(
      planId,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    // Format response to match user's requested structure
    const responseData = {
      _id: updatedPlan._id,
      planName: updatedPlan.planName,
      description: updatedPlan.description,
      duration: updatedPlan.duration,
      priceMonthly: updatedPlan.priceMonthly,
      planFeatures: {
        unlimitedLoans: updatedPlan.planFeatures.unlimitedLoans,
        advancedAnalytics: updatedPlan.planFeatures.advancedAnalytics,
        prioritySupport: updatedPlan.planFeatures.prioritySupport,
      },
      isActive: updatedPlan.isActive,
      createdAt: updatedPlan.createdAt,
      updatedAt: updatedPlan.updatedAt,
    };

    return res.status(200).json({
      success: true,
      message: "Plan updated successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Error updating plan:", error);

    // Handle validation errors
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

    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get all plans (Admin only - includes inactive plans)
const getAllPlans = async (req, res) => {
  try {
    const { isActive, duration, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    // Build query
    const query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }
    if (duration) {
      query.duration = duration;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const plans = await Plan.find(query).sort(sort).lean();

    // Format response data
    const formattedPlans = plans.map((plan) => ({
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
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
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
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Get all active plans (Public - for lenders to view available plans)
const getActivePlans = async (req, res) => {
  try {
    const { duration, sortBy = "priceMonthly", sortOrder = "asc" } = req.query;

    // Build query - only active plans
    const query = { isActive: true };
    if (duration) {
      query.duration = duration;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const plans = await Plan.find(query).sort(sort).lean();

    // Format response data
    const formattedPlans = plans.map((plan) => ({
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
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
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

    const plan = await Plan.findById(planId).lean();

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
      sortOrder = "desc" 
    } = req.query;

    // Build query - only lenders (roleId: 1) who have purchased a plan
    const query = {
      roleId: 1,
      currentPlanId: { $exists: true, $ne: null }, // Must have a plan purchased
    };

    const now = new Date();
    
    // Add plan status filter (active/expired) using date comparison
    if (planStatus && planStatus !== "all") {
      if (planStatus === "active") {
        // Plan is active if expiry date is in the future
        query.planExpiryDate = { $gt: now };
      } else if (planStatus === "expired") {
        // Plan is expired if expiry date is in the past or null
        query.$or = [
          { planExpiryDate: { $lt: now } },
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
      
      // Handle $or conflict if planStatus is "expired" (which already uses $or)
      if (query.$or && planStatus === "expired") {
        // Use $and to combine expired condition with search condition
        const expiredCondition = { $or: query.$or };
        delete query.$or;
        query.$and = [
          expiredCondition,
          searchConditions,
        ];
      } else {
        // No conflict, use $or for search
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
          select: "planName description duration priceMonthly planFeatures isActive",
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

    // Format response data with plan status and additional details
    const formattedLenders = lenders.map((lender) => {
      const expiryDate = lender.planExpiryDate ? new Date(lender.planExpiryDate) : null;
      const isPlanActive = expiryDate && expiryDate > now;
      const remainingDays = expiryDate && expiryDate > now
        ? Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)))
        : 0;

      return {
        lender: {
          _id: lender._id,
          userName: lender.userName,
          email: lender.email,
          mobileNo: lender.mobileNo,
          profileImage: lender.profileImage,
          aadharCardNo: lender.aadharCardNo,
          panCardNumber: lender.panCardNumber,
          address: lender.address,
          isMobileVerified: lender.isMobileVerified,
          isActive: lender.isActive,
          createdAt: lender.createdAt,
          updatedAt: lender.updatedAt,
        },
        currentPlan: lender.currentPlanId ? {
          _id: lender.currentPlanId._id,
          planName: lender.currentPlanId.planName,
          description: lender.currentPlanId.description,
          duration: lender.currentPlanId.duration,
          priceMonthly: lender.currentPlanId.priceMonthly,
          planFeatures: {
            unlimitedLoans: lender.currentPlanId.planFeatures?.unlimitedLoans ?? true,
            advancedAnalytics: lender.currentPlanId.planFeatures?.advancedAnalytics ?? false,
            prioritySupport: lender.currentPlanId.planFeatures?.prioritySupport ?? false,
          },
          isActive: lender.currentPlanId.isActive,
        } : null,
        planPurchaseDetails: {
          planPurchaseDate: lender.planPurchaseDate,
          planExpiryDate: lender.planExpiryDate,
          razorpayOrderId: lender.razorpayOrderId,
          razorpayPaymentId: lender.razorpayPaymentId,
          isPlanActive: isPlanActive,
          remainingDays: remainingDays,
          planStatus: isPlanActive ? "active" : "expired",
        },
      };
    });

    if (!formattedLenders.length) {
      return res.status(404).json({
        success: false,
        message: "No lenders with plans found",
        data: [],
        pagination: pagination,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Lenders with plans fetched successfully",
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

    // 2. Get plans updated by admin
    const plansUpdated = await Plan.find({ updatedAt: { $ne: null } })
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

    // 3. Get lenders who purchased subscription plans
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
      if (activity.type === 'plan_updated') {
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

module.exports = {
  createPlan,
  editPlan,
  getAllPlans,
  getActivePlans,
  getPlanById,
  getLendersWithPlans,
  getAdminRevenue,
  getRecentActivities,
};
