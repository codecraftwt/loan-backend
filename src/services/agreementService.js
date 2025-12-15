const generateLoanAgreement = (loan) => {
  const {
    name,
    aadhaarNumber,
    amount,
    loanStartDate,
    loanEndDate,
    purpose,
    lenderId,
  } = loan;

  return `
      LOAN AGREEMENT
  
      This agreement is made between the lender and borrower for a loan transaction, with the purpose of tracking the loan and providing updates.
  
      The details of the loan are as follows:
  
      Lender: ${lenderId}
      Aadhaar Number: ${aadhaarNumber}
      Loan Amount: ₹${amount}
      Purpose of Loan: ${purpose}
      Loan Start Date: ${loanStartDate.toLocaleDateString()}
      Loan End Date: ${loanEndDate.toLocaleDateString()}
  
      TERMS AND CONDITIONS:
  
      1. This platform only tracks the loan progress, sends notifications, and provides updates.
      2. The platform is **NOT RESPONSIBLE** for loan payments, repayments, or any other financial transactions related to this loan.
      3. The borrower and lender should handle all financial aspects of the loan outside of this platform.
      4. The platform will provide timely notifications related to the loan status, upcoming due dates, and any changes in the loan terms.
      5. Any disputes related to payments, loan terms, or actions taken by either party must be resolved between the borrower and lender directly.
  
      PLATFORM LIMITATIONS:
  
      - The platform does **NOT GUARANTEE** repayment or enforce the loan terms.
      - The platform is not responsible for tracking payment schedules or maintaining records beyond providing basic loan status updates.
      - All financial transactions, including loan disbursement, repayments, and interest rates, should be discussed and agreed upon between the lender and borrower directly.
  
      By accepting this loan, both the lender and borrower acknowledge the role of this platform in tracking and notifying but not engaging in any financial aspects of the loan.
  
      Signed by:
      [Signature of Borrower]
      [Signature of Lender]
  
      Date: ${new Date().toLocaleDateString()}
    `;
};

module.exports = { generateLoanAgreement };
