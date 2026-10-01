/**
 * Repayment Engine Utility
 * Handles EMI calculation (Reducing balance & Flat interest),
 * Schedule generation, and Payment Allocation for active loans.
 */

/**
 * Calculate Monthly EMI and Amortization Schedule
 * @param {Object} params
 * @param {number} params.principal - Sanctioned loan amount
 * @param {number} params.annualInterestRate - Annual interest rate in % (e.g. 12)
 * @param {number} params.tenureMonths - Tenure in months (e.g. 12)
 * @param {string} params.repaymentType - 'installment' | 'one-time'
 * @param {string} params.calculationMethod - 'reducing' | 'flat'
 * @param {string} params.frequency - 'monthly' | 'weekly' | 'quarterly'
 * @param {Date|string} params.startDate - Loan disbursement/start date
 * @param {Date|string} params.firstDueDate - First EMI due date
 */
exports.generateRepaymentSchedule = ({
  principal,
  annualInterestRate = 12,
  tenureMonths = 12,
  repaymentType = "installment",
  calculationMethod = "reducing",
  frequency = "monthly",
  startDate = new Date(),
  firstDueDate = null,
}) => {
  const P = Number(principal);
  const R = Number(annualInterestRate) || 12;
  const N = Math.max(1, Number(tenureMonths) || 12);
  const start = new Date(startDate || Date.now());

  // Set default first due date (1 month from start date if not specified)
  let initialDueDate = firstDueDate ? new Date(firstDueDate) : new Date(start);
  if (!firstDueDate) {
    initialDueDate.setMonth(initialDueDate.getMonth() + 1);
  }

  // ─── Case 1: One-Time / Bullet Repayment ───
  if (repaymentType === "one-time") {
    const totalInterest = Math.round((P * R * (N / 12)) / 100);
    const totalRepayment = P + totalInterest;

    const maturityDate = new Date(start);
    maturityDate.setMonth(maturityDate.getMonth() + N);

    const installments = [
      {
        installmentNumber: 1,
        dueDate: maturityDate,
        principalAmount: P,
        interestAmount: totalInterest,
        totalAmount: totalRepayment,
        paidAmount: 0,
        status: "pending",
        penaltyAmount: 0,
        paidAt: null,
        transactionReference: null,
        notes: "Bullet repayment at maturity",
      },
    ];

    return {
      repaymentType: "one-time",
      calculationMethod: "flat",
      frequency: "bullet",
      principal: P,
      annualInterestRate: R,
      tenureMonths: N,
      monthlyEmi: 0,
      totalInterest,
      totalRepayment,
      maturityDate,
      installments,
    };
  }

  // ─── Case 2: Installment / Regular EMI Repayment ───
  let monthlyEmi = 0;
  let totalInterest = 0;
  let totalRepayment = 0;
  const installments = [];

  if (calculationMethod === "flat") {
    // Flat Rate Interest: Total Interest = P * (R/100) * (N/12)
    totalInterest = Math.round((P * (R / 100) * N) / 12);
    totalRepayment = P + totalInterest;
    monthlyEmi = Math.round(totalRepayment / N);

    const principalPerMonth = Math.round(P / N);
    const interestPerMonth = Math.round(totalInterest / N);

    let remainingPrincipal = P;

    for (let i = 1; i <= N; i++) {
      const dueDate = new Date(initialDueDate);
      dueDate.setMonth(dueDate.getMonth() + (i - 1));

      const isLast = i === N;
      const curPrincipal = isLast ? remainingPrincipal : principalPerMonth;
      const curInterest = isLast ? totalInterest - interestPerMonth * (N - 1) : interestPerMonth;
      const curTotal = curPrincipal + curInterest;

      remainingPrincipal -= curPrincipal;

      installments.push({
        installmentNumber: i,
        dueDate,
        principalAmount: curPrincipal,
        interestAmount: curInterest,
        totalAmount: curTotal,
        paidAmount: 0,
        status: "pending",
        penaltyAmount: 0,
        paidAt: null,
        transactionReference: null,
        notes: `EMI #${i} of ${N}`,
      });
    }
  } else {
    // Standard Institutional Reducing Balance Amortization Formula
    // EMI = P * r * (1+r)^n / ((1+r)^n - 1)
    const monthlyRate = R / 12 / 100;

    if (monthlyRate === 0) {
      monthlyEmi = Math.round(P / N);
      totalInterest = 0;
      totalRepayment = P;
    } else {
      const factor = Math.pow(1 + monthlyRate, N);
      monthlyEmi = Math.round((P * monthlyRate * factor) / (factor - 1));
      totalRepayment = monthlyEmi * N;
      totalInterest = totalRepayment - P;
    }

    let remainingPrincipal = P;

    for (let i = 1; i <= N; i++) {
      const dueDate = new Date(initialDueDate);
      dueDate.setMonth(dueDate.getMonth() + (i - 1));

      const interestForMonth = Math.round(remainingPrincipal * monthlyRate);
      let principalForMonth = monthlyEmi - interestForMonth;

      if (i === N || principalForMonth > remainingPrincipal) {
        principalForMonth = remainingPrincipal;
      }

      const totalForMonth = principalForMonth + interestForMonth;
      remainingPrincipal -= principalForMonth;

      installments.push({
        installmentNumber: i,
        dueDate,
        principalAmount: principalForMonth,
        interestAmount: interestForMonth,
        totalAmount: totalForMonth,
        paidAmount: 0,
        status: "pending",
        penaltyAmount: 0,
        paidAt: null,
        transactionReference: null,
        notes: `EMI #${i} of ${N}`,
      });
    }
  }

  const maturityDate = installments[installments.length - 1]?.dueDate || new Date();

  return {
    repaymentType: "installment",
    calculationMethod,
    frequency,
    principal: P,
    annualInterestRate: R,
    tenureMonths: N,
    monthlyEmi,
    totalInterest,
    totalRepayment,
    maturityDate,
    installments,
  };
};

/**
 * Allocate payment against loan installments and update loan state
 */
exports.allocatePaymentToLoan = ({
  loan,
  paymentAmount,
  paymentMode,
  transactionReference,
  paymentDate = new Date(),
  notes = "",
  paymentProof = null,
  recordedBy = null,
}) => {
  let unallocated = Number(paymentAmount);
  if (unallocated <= 0) return loan;

  const now = new Date(paymentDate || Date.now());

  // 1. Traverse installments in chronological order
  if (Array.isArray(loan.installments) && loan.installments.length > 0) {
    for (const inst of loan.installments) {
      if (unallocated <= 0) break;

      if (inst.status !== "paid") {
        const requiredAmount = (inst.totalAmount || 0) + (inst.penaltyAmount || 0);
        const currentPaid = inst.paidAmount || 0;
        const outstandingOnInstallment = requiredAmount - currentPaid;

        if (outstandingOnInstallment > 0) {
          if (unallocated >= outstandingOnInstallment) {
            inst.paidAmount = requiredAmount;
            inst.status = "paid";
            inst.paidAt = now;
            inst.transactionReference = transactionReference || inst.transactionReference;
            if (notes) inst.notes = `${inst.notes ? inst.notes + " | " : ""}${notes}`;
            unallocated -= outstandingOnInstallment;
          } else {
            inst.paidAmount = currentPaid + unallocated;
            inst.status = "partially_paid";
            inst.paidAt = now;
            inst.transactionReference = transactionReference || inst.transactionReference;
            if (notes) inst.notes = `${inst.notes ? inst.notes + " | " : ""}${notes}`;
            unallocated = 0;
          }
        }
      }
    }
  }

  // 2. Update Loan level aggregate numbers
  const currentTotalPaid = Number(loan.totalPaid || 0);
  loan.totalPaid = currentTotalPaid + Number(paymentAmount);

  const expectedTotal =
    Number(loan.totalRepaymentExpected || loan.underwriting?.totalRepayment || loan.amount || 0);
  loan.remainingAmount = Math.max(0, expectedTotal - loan.totalPaid);

  // 3. Count paid installments and determine next due date
  let paidCount = 0;
  let nextDue = null;

  if (Array.isArray(loan.installments)) {
    for (const inst of loan.installments) {
      if (inst.status === "paid") {
        paidCount++;
      } else if (!nextDue && (inst.status === "pending" || inst.status === "partially_paid")) {
        nextDue = inst.dueDate;
      }
    }
  }

  if (!loan.installmentPlan) {
    loan.installmentPlan = {};
  }
  loan.installmentPlan.paidInstallments = paidCount;
  loan.installmentPlan.nextDueDate = nextDue;

  // 4. Update overall loan paymentStatus
  if (loan.remainingAmount <= 0) {
    loan.paymentStatus = "paid";
    loan.status = "closed";
  } else if (loan.totalPaid > 0) {
    loan.paymentStatus = "part paid";
  }

  // 5. Append to paymentHistory ledger
  if (!Array.isArray(loan.paymentHistory)) {
    loan.paymentHistory = [];
  }

  loan.paymentHistory.push({
    amount: Number(paymentAmount),
    paymentMode: ["cash", "online"].includes(paymentMode) ? paymentMode : "online",
    paymentType: loan.repaymentType === "one-time" ? "one-time" : "installment",
    installmentNumber: paidCount,
    paymentDate: now,
    transactionId: transactionReference || `TXN-${Date.now().toString().slice(-8)}`,
    notes: notes || "Payment recorded by lender",
    paymentProof: paymentProof || null,
    paymentStatus: "confirmed",
    confirmedBy: recordedBy || loan.lenderId,
    confirmedAt: now,
  });

  return loan;
};
