const Plan = require("../../models/Plan");

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

module.exports = {
  createPlan,
  editPlan,
  getAllPlans,
  getActivePlans,
  getPlanById,
};
