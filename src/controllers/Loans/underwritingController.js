const Loan = require("../../models/Loan");
const Document = require("../../models/Document");
const AuditLog = require("../../models/AuditLog");
const User = require("../../models/User");
const { calculateUnderwriting } = require("../../services/underwritingEngine");
const { evaluateRisk } = require("../../services/riskScoringEngine");
const { generateInvestmentCommitteeMemo, generateTermSheetDetails } = require("../../services/aiUnderwritingService");

/**
 * Get Deal Pipeline summary (Kanban & Table data)
 */
exports.getDealPipeline = async (req, res) => {
  try {
    const userId = req.user.id;
    const roleId = Number(req.user.roleId);

    let query = {};
    if (roleId === 1) {
      // Lender: deals assigned to this lender or open intake deals
      query = { $or: [{ lenderId: userId }, { lenderId: null }] };
    } else if (roleId === 2) {
      // Borrower: only deals submitted by this borrower
      query = { borrowerId: userId };
    }

    const deals = await Loan.find(query)
      .populate("borrowerId", "userName email mobileNo companyName")
      .populate("lenderId", "userName email companyName")
      .sort({ updatedAt: -1 });

    // Pipeline stages definition
    const stages = [
      "intake",
      "doc_collection",
      "underwriting",
      "committee_review",
      "term_sheet_issued",
      "processing_title",
      "approved_funded",
      "closed",
    ];

    const grouped = {};
    stages.forEach((s) => (grouped[s] = []));

    deals.forEach((deal) => {
      const stage = deal.pipelineStage || "intake";
      if (grouped[stage]) {
        grouped[stage].push(deal);
      } else {
        if (!grouped["other"]) grouped["other"] = [];
        grouped["other"].push(deal);
      }
    });

    const totalDeals = deals.length;
    const totalVolume = deals.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const activeVolume = deals
      .filter((d) => !["closed", "rejected"].includes(d.pipelineStage))
      .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        deals,
        grouped,
        metrics: {
          totalDeals,
          totalVolume,
          activeVolume,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching deal pipeline:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch deal pipeline.",
      error: error.message,
    });
  }
};

/**
 * Get single Deal details with DMS docs and Audit logs
 */
exports.getDealDetails = async (req, res) => {
  try {
    const { loanId } = req.params;
    const deal = await Loan.findById(loanId)
      .populate("borrowerId", "userName email mobileNo address panCardNumber aadharCardNo companyName ein")
      .populate("lenderId", "userName email mobileNo companyName licenseNumber");

    if (!deal) {
      return res.status(404).json({
        success: false,
        message: "Loan deal not found.",
      });
    }

    const documents = await Document.find({ loanId }).sort({ createdAt: -1 });
    const auditLogs = await AuditLog.find({ loanId }).sort({ createdAt: -1 }).limit(50);

    return res.status(200).json({
      success: true,
      data: {
        deal,
        documents,
        auditLogs,
      },
    });
  } catch (error) {
    console.error("Error fetching deal details:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch deal details.",
      error: error.message,
    });
  }
};

/**
 * Run Underwriting Calculations for a deal
 */
exports.calculateUnderwriting = async (req, res) => {
  try {
    const { loanId } = req.params;
    const params = req.body;

    const deal = await Loan.findById(loanId);
    if (!deal) {
      return res.status(404).json({ success: false, message: "Deal not found." });
    }

    const inputData = {
      loanAmount: params.loanAmount || deal.underwriting?.loanAmount || deal.amount,
      purchasePrice: params.purchasePrice || deal.propertyDetails?.purchasePrice || deal.amount,
      asIsValue: params.asIsValue || deal.propertyDetails?.asIsValue || deal.propertyDetails?.purchasePrice,
      arv: params.arv || deal.propertyDetails?.arv,
      rehabBudget: params.rehabBudget || deal.propertyDetails?.rehabBudget || 0,
      interestRate: params.interestRate || deal.underwriting?.interestRate || 10.5,
      originationPoints: params.originationPoints || deal.underwriting?.originationPoints || 2.0,
      underwritingFee: params.underwritingFee || deal.underwriting?.underwritingFee || 1500,
      processingFee: params.processingFee || deal.underwriting?.processingFee || 995,
      requestedTermMonths: params.requestedTermMonths || deal.underwriting?.requestedTermMonths || 12,
      interestReserveMonths: params.interestReserveMonths || deal.underwriting?.interestReserveMonths || 6,
      isDutchInterest: params.isDutchInterest ?? deal.underwriting?.isDutchInterest ?? false,
      estimatedMonthlyRent: params.estimatedMonthlyRent || deal.propertyDetails?.estimatedMonthlyRent || 0,
      annualTaxes: params.annualTaxes || deal.propertyDetails?.annualTaxes || 0,
      annualInsurance: params.annualInsurance || deal.propertyDetails?.annualInsurance || 0,
      creditScore: deal.borrowerExperience?.creditScore || 700,
    };

    const underwritingResult = calculateUnderwriting(inputData);

    if (params.save) {
      deal.underwriting = underwritingResult;
      if (params.loanAmount) deal.amount = params.loanAmount;
      if (params.purchasePrice) deal.propertyDetails.purchasePrice = params.purchasePrice;
      if (params.asIsValue) deal.propertyDetails.asIsValue = params.asIsValue;
      if (params.arv) deal.propertyDetails.arv = params.arv;
      if (params.rehabBudget !== undefined) deal.propertyDetails.rehabBudget = params.rehabBudget;

      await deal.save();

      await AuditLog.create({
        loanId: deal._id,
        userId: req.user.id,
        userRole: Number(req.user.roleId) === 1 ? "lender" : "admin",
        action: "UPDATED_UNDERWRITING",
        module: "underwriting",
        details: `Underwriting calculated: LTV ${underwritingResult.ltv}%, ARV LTV ${underwritingResult.arvLtv}%, LTC ${underwritingResult.ltc}%, Rate ${underwritingResult.interestRate}%`,
      });
    }

    return res.status(200).json({
      success: true,
      data: underwritingResult,
    });
  } catch (error) {
    console.error("Error calculating underwriting:", error);
    return res.status(500).json({
      success: false,
      message: "Underwriting calculation failed.",
      error: error.message,
    });
  }
};

/**
 * Run Multi-Factor Risk Assessment
 */
exports.evaluateRiskAssessment = async (req, res) => {
  try {
    const { loanId } = req.params;
    const deal = await Loan.findById(loanId);
    if (!deal) {
      return res.status(404).json({ success: false, message: "Deal not found." });
    }

    const riskResult = evaluateRisk(deal);

    if (req.body.save !== false) {
      deal.riskAssessment = riskResult;
      await deal.save();

      await AuditLog.create({
        loanId: deal._id,
        userId: req.user.id,
        userRole: "lender",
        action: "EVALUATED_RISK",
        module: "risk_scoring",
        details: `Assigned ${riskResult.riskTier} (Score: ${riskResult.overallScore})`,
      });
    }

    return res.status(200).json({
      success: true,
      data: riskResult,
    });
  } catch (error) {
    console.error("Error evaluating risk:", error);
    return res.status(500).json({
      success: false,
      message: "Risk evaluation failed.",
      error: error.message,
    });
  }
};

/**
 * Generate Investment Committee Underwriting Memo
 */
exports.generateUnderwritingMemo = async (req, res) => {
  try {
    const { loanId } = req.params;
    const deal = await Loan.findById(loanId).populate("borrowerId");
    if (!deal) {
      return res.status(404).json({ success: false, message: "Deal not found." });
    }

    const memo = generateInvestmentCommitteeMemo(deal);
    deal.underwritingMemo = memo;
    await deal.save();

    await AuditLog.create({
      loanId: deal._id,
      userId: req.user.id,
      userRole: "lender",
      action: "GENERATED_MEMO",
      module: "underwriting",
      details: "Synthesized AI Investment Committee Underwriting Memo",
    });

    return res.status(200).json({
      success: true,
      data: memo,
    });
  } catch (error) {
    console.error("Error generating memo:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate underwriting memo.",
      error: error.message,
    });
  }
};

/**
 * Issue Term Sheet / LOI to Borrower
 */
exports.issueTermSheet = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { customTerms } = req.body;

    const deal = await Loan.findById(loanId);
    if (!deal) {
      return res.status(404).json({ success: false, message: "Deal not found." });
    }

    const termSheetData = generateTermSheetDetails(deal);
    if (customTerms) {
      Object.assign(termSheetData, customTerms);
    }
    termSheetData.status = "issued";
    termSheetData.issuedDate = new Date();

    deal.termSheet = termSheetData;
    deal.pipelineStage = "term_sheet_issued";
    await deal.save();

    await AuditLog.create({
      loanId: deal._id,
      userId: req.user.id,
      userRole: "lender",
      action: "ISSUED_TERM_SHEET",
      module: "term_sheet",
      details: `Issued Term Sheet ${termSheetData.termSheetNumber} for $${deal.termSheet.loanAmount} at ${deal.termSheet.interestRate}%`,
    });

    return res.status(200).json({
      success: true,
      message: "Term sheet successfully issued to borrower.",
      data: deal.termSheet,
    });
  } catch (error) {
    console.error("Error issuing term sheet:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to issue term sheet.",
      error: error.message,
    });
  }
};

/**
 * Borrower Accepts / Signs Term Sheet
 */
exports.acceptTermSheet = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { signature } = req.body;

    const deal = await Loan.findById(loanId);
    if (!deal) {
      return res.status(404).json({ success: false, message: "Deal not found." });
    }

    if (!deal.termSheet) {
      deal.termSheet = {
        termSheetNumber: `TS-${Date.now().toString().slice(-6)}`,
        status: "accepted",
      };
    }
    deal.termSheet.status = "accepted";
    deal.termSheet.acceptedDate = new Date();
    deal.termSheet.borrowerSignature = req.body.signature || req.body.signatureName || deal.name || "Borrower";
    deal.pipelineStage = "processing_title";
    await deal.save();

    await AuditLog.create({
      loanId: deal._id,
      userId: req.user.id,
      userRole: "borrower",
      action: "ACCEPTED_TERM_SHEET",
      module: "term_sheet",
      details: `Borrower digitally accepted and executed Term Sheet ${deal.termSheet.termSheetNumber}`,
    });

    return res.status(200).json({
      success: true,
      message: "Term Sheet accepted! Deal advanced to Processing & Title.",
      data: deal.termSheet,
    });
  } catch (error) {
    console.error("Error accepting term sheet:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to accept term sheet.",
      error: error.message,
    });
  }
};

/**
 * Update Pipeline Stage (e.g. from Kanban drag or workflow buttons)
 */
exports.updatePipelineStage = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { pipelineStage, notes } = req.body;

    const deal = await Loan.findById(loanId);
    if (!deal) {
      return res.status(404).json({ success: false, message: "Deal not found." });
    }

    const previousStage = deal.pipelineStage;
    deal.pipelineStage = pipelineStage;
    await deal.save();

    await AuditLog.create({
      loanId: deal._id,
      userId: req.user.id,
      userRole: Number(req.user.roleId) === 1 ? "lender" : Number(req.user.roleId) === 0 ? "admin" : "borrower",
      action: "STAGE_TRANSITION",
      module: "status_change",
      details: `Pipeline stage moved from '${previousStage}' to '${pipelineStage}'. ${notes ? `Notes: ${notes}` : ""}`,
    });

    return res.status(200).json({
      success: true,
      message: `Stage updated to ${pipelineStage}`,
      data: {
        loanId: deal._id,
        pipelineStage: deal.pipelineStage,
      },
    });
  } catch (error) {
    console.error("Error updating pipeline stage:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update pipeline stage.",
      error: error.message,
    });
  }
};

/**
 * Update Deal Checklist Conditions
 */
exports.updateDealConditions = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { conditions } = req.body;

    const deal = await Loan.findById(loanId);
    if (!deal) {
      return res.status(404).json({ success: false, message: "Deal not found." });
    }

    deal.conditionsChecklist = conditions;
    await deal.save();

    await AuditLog.create({
      loanId: deal._id,
      userId: req.user.id,
      userRole: "lender",
      action: "UPDATED_CONDITIONS",
      module: "condition",
      details: "Updated closing checklist conditions",
    });

    return res.status(200).json({
      success: true,
      data: deal.conditionsChecklist,
    });
  } catch (error) {
    console.error("Error updating conditions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update conditions.",
      error: error.message,
    });
  }
};
