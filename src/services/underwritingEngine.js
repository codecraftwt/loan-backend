/**
 * Commercial Real Estate (CRE) Underwriting & Financial Calculation Engine
 * Implements standard PML / Bridge / Fix & Flip financial ratio calculations
 */

function calculateUnderwriting(params = {}) {
  const {
    loanAmount = 0,
    purchasePrice = 0,
    asIsValue = 0,
    arv = 0,
    rehabBudget = 0,
    interestRate = 10.5, // % per annum
    originationPoints = 2.0, // % of loan
    underwritingFee = 1500,
    processingFee = 995,
    requestedTermMonths = 12,
    interestReserveMonths = 6,
    isDutchInterest = false,
    estimatedMonthlyRent = 0,
    annualTaxes = 0,
    annualInsurance = 0,
    creditScore = 700,
    limits = {
      maxLtv: 75,
      maxArvLtv: 70,
      maxLtc: 85,
      minDscr: 1.20,
      minCreditScore: 650,
    },
  } = params;

  const effectiveAsIs = Number(asIsValue) || Number(purchasePrice) || 1;
  const effectiveArv = Number(arv) || effectiveAsIs;
  const totalCost = Number(purchasePrice) + Number(rehabBudget) || 1;
  const numLoan = Number(loanAmount) || 0;

  // 1. Ratio Calculations
  const ltv = Number(((numLoan / effectiveAsIs) * 100).toFixed(2));
  const arvLtv = Number(((numLoan / effectiveArv) * 100).toFixed(2));
  const ltc = Number(((numLoan / totalCost) * 100).toFixed(2));

  // 2. Debt Service & Cash Flow (DSCR)
  const annualGrossRent = Number(estimatedMonthlyRent) * 12;
  const annualOperatingExpenses = Number(annualTaxes) + Number(annualInsurance) + (annualGrossRent * 0.1); // 10% maintenance/mgmt
  const netOperatingIncome = Math.max(0, annualGrossRent - annualOperatingExpenses);
  
  // Annual interest payment
  const annualDebtService = Number((numLoan * (Number(interestRate) / 100)).toFixed(2));
  const monthlyInterestPayment = Number((annualDebtService / 12).toFixed(2));

  const dscr = annualDebtService > 0 && annualGrossRent > 0
    ? Number((netOperatingIncome / annualDebtService).toFixed(2))
    : 0;

  // 3. Fees & Reserves
  const originationFee = Number((numLoan * (Number(originationPoints) / 100)).toFixed(2));
  const totalLenderFees = originationFee + Number(underwritingFee) + Number(processingFee);
  
  // Interest reserve (Dutch interest vs standard holdback)
  const interestReserveAmount = isDutchInterest
    ? Number((monthlyInterestPayment * Number(interestReserveMonths)).toFixed(2))
    : Number((monthlyInterestPayment * Math.min(6, Number(interestReserveMonths))).toFixed(2));

  // 4. Borrower Cash Required to Close
  // Down payment = (Purchase Price - Loan Amount allocated to purchase)
  const downPayment = Math.max(0, Number(purchasePrice) - numLoan);
  const estimatedClosingCosts = 3500; // Title, legal, recording
  const cashRequiredToClose = Number(
    (downPayment + totalLenderFees + interestReserveAmount + estimatedClosingCosts).toFixed(2)
  );

  // 5. Automated Lending Criteria Validation Rules
  const messages = [];
  let isValid = true;

  if (ltv > limits.maxLtv) {
    isValid = false;
    messages.push(`LTV of ${ltv}% exceeds the maximum guideline of ${limits.maxLtv}%`);
  }

  if (effectiveArv > 0 && arvLtv > limits.maxArvLtv) {
    isValid = false;
    messages.push(`ARV LTV of ${arvLtv}% exceeds the maximum threshold of ${limits.maxArvLtv}%`);
  }

  if (ltc > limits.maxLtc) {
    isValid = false;
    messages.push(`LTC of ${ltc}% exceeds the maximum limit of ${limits.maxLtc}%`);
  }

  if (estimatedMonthlyRent > 0 && dscr > 0 && dscr < limits.minDscr) {
    messages.push(`DSCR of ${dscr} is below the target minimum of ${limits.minDscr}`);
  }

  if (Number(creditScore) < limits.minCreditScore) {
    messages.push(`Borrower credit score (${creditScore}) is below preferred minimum (${limits.minCreditScore})`);
  }

  if (messages.length === 0) {
    messages.push("Deal parameters meet standard underwriting guidelines.");
  }

  return {
    loanAmount: numLoan,
    purchasePrice: Number(purchasePrice),
    asIsValue: Number(asIsValue),
    arv: Number(arv),
    rehabBudget: Number(rehabBudget),
    interestRate: Number(interestRate),
    originationPoints: Number(originationPoints),
    originationFee,
    underwritingFee: Number(underwritingFee),
    processingFee: Number(processingFee),
    totalLenderFees,
    requestedTermMonths: Number(requestedTermMonths),
    ltv,
    arvLtv,
    ltc,
    dscr,
    netOperatingIncome: Number(netOperatingIncome.toFixed(2)),
    annualDebtService,
    monthlyInterestPayment,
    interestReserveMonths: Number(interestReserveMonths),
    interestReserveAmount,
    isDutchInterest: Boolean(isDutchInterest),
    cashRequiredToClose,
    validationStatus: {
      isValid,
      messages,
    },
    calculatedAt: new Date(),
  };
}

module.exports = {
  calculateUnderwriting,
};
