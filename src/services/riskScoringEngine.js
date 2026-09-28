/**
 * Multi-Factor Risk Assessment & Tiering Engine
 * Evaluates Collateral, Borrower Track Record, Liquidity Buffer, and Exit Strategy
 */

function evaluateRisk(dealData = {}) {
  const {
    underwriting = {},
    propertyDetails = {},
    borrowerExperience = {},
  } = dealData;

  const ltv = Number(underwriting.ltv) || 0;
  const arvLtv = Number(underwriting.arvLtv) || ltv;
  const ltc = Number(underwriting.ltc) || 0;
  const creditScore = Number(borrowerExperience.creditScore) || 700;
  const completedProjects = Number(borrowerExperience.completedProjects) || 0;
  const currentLiquidity = Number(borrowerExperience.currentLiquidity) || 0;
  const monthlyPayment = Number(underwriting.monthlyInterestPayment) || 1;
  const propertyType = propertyDetails.propertyType || "single_family";
  const exitStrategy = borrowerExperience.exitStrategy || "sale";

  const redFlags = [];

  // 1. Collateral Score (0-100)
  let collateralScore = 85;
  if (ltv > 75) {
    collateralScore -= 25;
    redFlags.push({
      code: "HIGH_LTV",
      severity: "high",
      message: `LTV of ${ltv}% is above conservative threshold (75%).`,
      mitigant: "Require additional equity contribution or reduce loan amount.",
    });
  } else if (ltv > 70) {
    collateralScore -= 10;
  }

  if (arvLtv > 70) {
    collateralScore -= 15;
    redFlags.push({
      code: "HIGH_ARV_LTV",
      severity: "medium",
      message: `ARV LTV of ${arvLtv}% leaves tight margin for property value fluctuations.`,
      mitigant: "Order independent appraisal with strict 3-mile comparables.",
    });
  }

  if (propertyType === "land" || propertyType === "industrial") {
    collateralScore -= 10;
  }

  // 2. Borrower Experience Score (0-100)
  let experienceScore = 50;
  if (completedProjects >= 6) {
    experienceScore = 95;
  } else if (completedProjects >= 3) {
    experienceScore = 80;
  } else if (completedProjects >= 1) {
    experienceScore = 65;
  } else {
    experienceScore = 45;
    redFlags.push({
      code: "NOVICE_BORROWER",
      severity: "medium",
      message: "First-time investor / less than 2 completed projects in track record.",
      mitigant: "Require licensed general contractor agreement and detailed line-item scope.",
    });
  }

  if (creditScore >= 740) {
    experienceScore += 5;
  } else if (creditScore < 650) {
    experienceScore -= 20;
    redFlags.push({
      code: "LOW_CREDIT",
      severity: "high",
      message: `Borrower credit score (${creditScore}) is below standard private lending benchmark.`,
      mitigant: "Require co-signer / strong liquid guarantor.",
    });
  }

  // 3. Liquidity & Reserve Buffer Score (0-100)
  const monthsOfReserve = monthlyPayment > 0 ? currentLiquidity / monthlyPayment : 0;
  let liquidityScore = 75;
  if (monthsOfReserve >= 12) {
    liquidityScore = 95;
  } else if (monthsOfReserve >= 6) {
    liquidityScore = 85;
  } else if (monthsOfReserve >= 3) {
    liquidityScore = 65;
  } else {
    liquidityScore = 40;
    redFlags.push({
      code: "LOW_POST_CLOSE_LIQUIDITY",
      severity: "critical",
      message: `Post-closing liquidity only covers ~${monthsOfReserve.toFixed(1)} months of debt service.`,
      mitigant: "Mandate upfront 6-month interest reserve escrow holdback.",
    });
  }

  // 4. Exit Strategy Score (0-100)
  let exitStrategyScore = 80;
  if (exitStrategy === "sale") {
    exitStrategyScore = 85;
  } else if (exitStrategy === "refinance") {
    exitStrategyScore = 75; // Dependent on takeout mortgage market rates
  }

  // Aggregate Overall Score (Weighted Average)
  // Collateral 35%, Experience 25%, Liquidity 25%, Exit Strategy 15%
  const overallScore = Math.round(
    collateralScore * 0.35 +
      experienceScore * 0.25 +
      liquidityScore * 0.25 +
      exitStrategyScore * 0.15
  );

  // Dynamic Tier Assignment
  let riskTier = "Tier 1 - Low Risk";
  const recommendedConditions = [];

  if (overallScore >= 80) {
    riskTier = "Tier 1 - Low Risk";
    recommendedConditions.push("Standard Title Policy & As-Is Appraisal required");
    recommendedConditions.push("Standard 3-month interest reserve");
  } else if (overallScore >= 65) {
    riskTier = "Tier 2 - Moderate Risk";
    recommendedConditions.push("Full 6-month interest reserve holdback");
    recommendedConditions.push("Detailed General Contractor draw schedule & lien waivers");
    recommendedConditions.push("Personal Guaranty of all 20%+ entity owners");
  } else {
    riskTier = "Tier 3 - High Risk";
    recommendedConditions.push("9-month interest reserve holdback");
    recommendedConditions.push("Mandatory Dutch interest or 100% upfront interest escrow");
    recommendedConditions.push("Third-party property inspection & feasibility validation");
    recommendedConditions.push("Strict construction draw milestones with re-inspection fees");
  }

  return {
    collateralScore: Math.max(0, Math.min(100, collateralScore)),
    experienceScore: Math.max(0, Math.min(100, experienceScore)),
    liquidityScore: Math.max(0, Math.min(100, liquidityScore)),
    exitStrategyScore: Math.max(0, Math.min(100, exitStrategyScore)),
    overallScore: Math.max(0, Math.min(100, overallScore)),
    riskTier,
    redFlags,
    recommendedConditions,
    assessedAt: new Date(),
  };
}

module.exports = {
  evaluateRisk,
};
