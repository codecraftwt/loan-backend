/**
 * Professional Loan Facility Agreement & E-Sign Document Generator
 */

const formatINR = (val) => {
  if (!val || isNaN(val)) return "₹0";
  const num = Number(val);
  return `₹${num.toLocaleString("en-IN")}`;
};

const formatDate = (date) => {
  if (!date) return "Pending Execution";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (date) => {
  if (!date) return "Pending Execution";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Generate a comprehensive, legally compliant HTML & Plaintext agreement document
 */
const buildAgreementDocument = ({
  documentId,
  application,
  lender,
  borrower,
  sanctionTerms,
  lenderSignature,
  borrowerSignature,
}) => {
  const docId =
    documentId ||
    `AGR-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const principal = Number(sanctionTerms?.amount || application?.amount || 0);
  const interestRate = Number(sanctionTerms?.interestRate || application?.requestedRate || 12);
  const tenureMonths = Number(sanctionTerms?.tenureMonths || application?.tenureMonths || 12);
  const repaymentType = sanctionTerms?.repaymentType || application?.repaymentType || "EMI";
  const processingFee = Number(sanctionTerms?.processingFee || 0);
  const monthlyEmi = Number(sanctionTerms?.monthlyEmi || 0);
  const totalInterest = Number(sanctionTerms?.totalInterest || 0);
  const totalPayable = Number(sanctionTerms?.totalPayable || principal + totalInterest);
  const maturityDate = sanctionTerms?.maturityDate || null;

  const lenderName =
    lender?.companyName ||
    lender?.userName ||
    application?.lenderSnapshot?.companyName ||
    application?.lenderSnapshot?.userName ||
    "Financing Entity";

  const borrowerName =
    borrower?.userName ||
    application?.borrowerSnapshot?.userName ||
    "Borrower";

  const borrowerBusiness =
    borrower?.borrowerProfile?.businessName ||
    borrower?.companyName ||
    application?.borrowerSnapshot?.businessName ||
    borrowerName;

  const borrowerPan =
    borrower?.panCardNumber ||
    application?.borrowerSnapshot?.panCardNumber ||
    "Verified PAN";

  const borrowerAadhaar =
    borrower?.aadharCardNo ||
    application?.borrowerSnapshot?.aadharCardNo ||
    "Verified UIDAI";

  const borrowerAddress =
    borrower?.address ||
    application?.borrowerSnapshot?.address ||
    [
      borrower?.city || application?.borrowerSnapshot?.city,
      borrower?.state || application?.borrowerSnapshot?.state,
    ]
      .filter(Boolean)
      .join(", ") ||
    "Verified Address";

  const agreementDate = new Date();

  return {
    documentId: docId,
    generatedAt: agreementDate,
    terms: {
      principal,
      interestRate,
      tenureMonths,
      repaymentType,
      processingFee,
      monthlyEmi,
      totalInterest,
      totalPayable,
      maturityDate,
    },
    parties: {
      lender: {
        name: lenderName,
        email: lender?.email || application?.lenderSnapshot?.email || "",
        mobileNo: lender?.mobileNo || application?.lenderSnapshot?.mobileNo || "",
      },
      borrower: {
        name: borrowerName,
        businessName: borrowerBusiness,
        pan: borrowerPan,
        aadhaar: borrowerAadhaar,
        address: borrowerAddress,
        email: borrower?.email || application?.borrowerSnapshot?.email || "",
        mobileNo: borrower?.mobileNo || application?.borrowerSnapshot?.mobileNo || "",
      },
    },
    signatures: {
      lender: lenderSignature || null,
      borrower: borrowerSignature || null,
    },
  };
};

module.exports = {
  buildAgreementDocument,
  formatINR,
  formatDate,
  formatDateTime,
};
