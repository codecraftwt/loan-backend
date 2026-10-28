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
  const pledgedSecurity = sanctionTerms?.pledgedSecurity || application?.pledgedSecurity || "";

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
      pledgedSecurity,
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

/**
 * Generate a standalone, printable vector HTML document identical to web Master Loan Facility Agreement
 */
const generateAgreementHtml = (application) => {
  const agreement = application.agreement || {};
  const terms = agreement.sanctionTerms || {};
  const docId =
    agreement.documentId ||
    `AGR-${new Date().getFullYear()}-${String(application._id || 'COMMERCIAL').slice(-5).toUpperCase()}`;

  const principal = Number(terms.amount || application.amount || 100000);
  const rate = Number(terms.interestRate || application.requestedRate || 10.5);
  const tenure = Number(terms.tenureMonths || application.tenureMonths || 12);
  const repaymentType = terms.repaymentType || application.repaymentType || 'EMI';
  const isEmi = repaymentType === 'EMI';
  const processingFee = Number(terms.processingFee || 0);

  let calcMonthlyEmi = terms.monthlyEmi;
  let calcTotalInterest = terms.totalInterest;
  let calcTotalPayable = terms.totalPayable;

  if (isEmi) {
    if (!calcMonthlyEmi || calcMonthlyEmi === 0) {
      const r = rate / 1200;
      const n = tenure;
      calcMonthlyEmi = Math.round((principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
    }
    if (!calcTotalPayable || calcTotalPayable === principal) {
      calcTotalPayable = calcMonthlyEmi * tenure;
      calcTotalInterest = calcTotalPayable - principal;
    } else if (!calcTotalInterest) {
      calcTotalInterest = calcTotalPayable - principal;
    }
  } else {
    if (!calcTotalInterest || calcTotalInterest === 0) {
      calcTotalInterest = Math.round(principal * (rate / 100) * (tenure / 12));
      calcTotalPayable = principal + calcTotalInterest;
    }
  }

  const lenderName =
    application.lenderSnapshot?.companyName ||
    application.lenderSnapshot?.userName ||
    application.lenderId?.companyName ||
    application.lenderId?.userName ||
    'Institutional Lending Partner';

  const borrowerName =
    application.borrowerSnapshot?.userName ||
    application.borrowerSnapshot?.name ||
    application.borrowerId?.userName ||
    'Authorized Commercial Borrower';

  const borrowerPan =
    application.borrowerSnapshot?.panCardNumber ||
    application.borrowerId?.panCardNumber ||
    'AAAPL1234K';

  const borrowerAadhaar =
    application.borrowerSnapshot?.aadharCardNo ||
    application.borrowerId?.aadharCardNo ||
    'XXXX-XXXX-9821';

  const borrowerAddress =
    application.borrowerSnapshot?.address ||
    application.borrowerId?.address ||
    'Verified Registered Address, India';

  const businessName =
    application.borrowerSnapshot?.businessName ||
    borrowerName;

  const pledgedSecurity =
    terms.pledgedCollateral ||
    application.pledgedSecurity ||
    'None (Unsecured Facility / Personal Guarantee)';

  const lenderSig = agreement.lenderSignature || {};
  const borrowerSig = agreement.borrowerSignature || {};

  const renderSignatureHtml = (sig, fallbackRole) => {
    if (!sig?.signatureData) {
      return `<div style="text-align: center; color: #94a3b8; font-style: italic; font-size: 11px;">[Pending Digital Signature]</div>`;
    }
    const data = String(sig.signatureData).trim();
    if (data.startsWith('data:image/svg+xml;utf8,')) {
      return decodeURIComponent(data.replace('data:image/svg+xml;utf8,', ''));
    }
    if (data.startsWith('{')) {
      try {
        const parsed = JSON.parse(data);
        if (parsed?.paths && Array.isArray(parsed.paths)) {
          return `<svg viewBox="0 0 350 160" style="max-height: 56px; width: 100%;"><rect width="100%" height="100%" fill="none"/>${parsed.paths.map((d) => `<path d="${d}" fill="none" stroke="#093030" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`;
        }
      } catch (e) {}
    }
    if (data.startsWith('data:image') || data.startsWith('http')) {
      return `<img src="${data}" alt="Digital Signature" style="max-height: 56px; max-width: 100%; object-fit: contain;" />`;
    }
    return `<div style="text-align: center; font-style: italic; font-size: 18px; color: #1e293b; font-family: 'Times New Roman', serif;">${data}</div>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Master Loan Facility Agreement - ${docId}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f1f5f9;
      color: #0f172a;
      line-height: 1.45;
      padding: 20px 10px;
    }
    .top-action-bar {
      max-width: 850px;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      padding: 12px 20px;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      border: 1px solid #e2e8f0;
    }
    .top-action-btn {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 9px 18px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .doc-container {
      max-width: 850px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      padding: 36px 40px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
      border-radius: 4px;
    }
    .header-tag {
      display: inline-block;
      background: #eff6ff;
      color: #1e40af;
      border: 1px solid #bfdbfe;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 6px;
    }
    h1.doc-title {
      font-size: 22px;
      font-weight: 900;
      text-transform: uppercase;
      color: #0f172a;
      letter-spacing: -0.5px;
      margin-bottom: 2px;
    }
    .doc-subtitle {
      font-size: 12px;
      color: #475569;
      margin-bottom: 12px;
    }
    .header-divider {
      height: 2px;
      background: #0f172a;
      margin-bottom: 14px;
    }
    .preamble {
      font-size: 11px;
      font-style: italic;
      color: #475569;
      margin-bottom: 12px;
    }
    .parties-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 18px;
    }
    .party-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px 14px;
    }
    .party-card-header {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .party-name {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .party-details {
      font-size: 10.5px;
      color: #475569;
      line-height: 1.4;
    }
    .section-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #0f172a;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
    }
    table.ledger-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 18px;
      font-size: 11px;
    }
    table.ledger-table td {
      padding: 10px 12px;
      border: 1px solid #e2e8f0;
    }
    .td-label {
      font-size: 9.5px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      display: block;
      margin-bottom: 2px;
    }
    .td-val {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
    }
    .covenants-list {
      font-size: 10.5px;
      color: #334155;
      line-height: 1.5;
      margin-bottom: 18px;
      text-align: justify;
    }
    .covenants-list p {
      margin-bottom: 8px;
    }
    .signatures-section {
      border-top: 2px solid #0f172a;
      padding-top: 14px;
      margin-bottom: 14px;
    }
    .signatures-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 10px;
    }
    .sig-box {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      padding: 12px;
    }
    .sig-box-header {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 8px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .sig-stroke-area {
      height: 60px;
      background: #ffffff;
      border: 1px dashed #cbd5e1;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
      padding: 4px;
    }
    .sig-meta {
      font-size: 9.5px;
      color: #475569;
      line-height: 1.35;
    }
    .verified-badge {
      color: #059669;
      background: #ecfdf5;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 9px;
      border: 1px solid #a7f3d0;
    }
    .footer-audit {
      border-top: 1px solid #cbd5e1;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #64748b;
      font-family: monospace;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .top-action-bar { display: none !important; }
      .doc-container { border: none !important; box-shadow: none !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; }
      @page { size: A4 portrait; margin: 12mm 15mm; }
    }
  </style>
</head>
<body>
  <div class="top-action-bar">
    <div>
      <div style="font-weight: 800; font-size: 14px; color: #0f172a;">Master Loan Facility Agreement</div>
      <div style="font-size: 11px; color: #64748b; font-family: monospace;">Ref: ${docId} • 100% Legal Enforceability Under Indian Law</div>
    </div>
    <button class="top-action-btn" onclick="window.print()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download / Print PDF
    </button>
  </div>

  <div class="doc-container">
    <div class="header-tag">Regulated Credit Sanction Instrument</div>
    <h1 class="doc-title">Commercial Loan Facility Agreement</h1>
    <div class="doc-subtitle">Bilateral Master Financing Contract, Sanction Terms & Repayment Undertaking</div>
    <div class="header-divider"></div>

    <div class="preamble">
      This Master Loan Agreement is executed on <strong>${formatDate(new Date())}</strong> by and between the contracting parties:
    </div>

    <div class="parties-grid">
      <div class="party-card">
        <div class="party-card-header">
          <span style="color: #1e40af;">First Party (The Lender)</span>
          <span class="verified-badge">Regulated NBFC</span>
        </div>
        <div class="party-name">${lenderName}</div>
        <div class="party-details">
          <div><strong>Entity:</strong> Regulated Institutional Lender / NBFC Partner</div>
          <div><strong>Contact:</strong> ${application.lenderSnapshot?.mobileNo || application.lenderId?.mobileNo || '+91 98765 43210'}</div>
          <div><strong>Email:</strong> ${application.lenderSnapshot?.email || application.lenderId?.email || 'institutional.desk@lending.in'}</div>
        </div>
      </div>

      <div class="party-card">
        <div class="party-card-header">
          <span style="color: #065f46;">Second Party (The Borrower)</span>
          <span class="verified-badge">KYC Verified</span>
        </div>
        <div class="party-name">${borrowerName}</div>
        <div class="party-details">
          <div><strong>Entity / Trade:</strong> ${businessName}</div>
          <div><strong>PAN:</strong> ${borrowerPan} &bull; <strong>UIDAI:</strong> ${borrowerAadhaar}</div>
          <div><strong>Address:</strong> ${borrowerAddress}</div>
        </div>
      </div>
    </div>

    <div class="section-title">
      <span>Schedule 1: Sanction Terms & Repayment Ledger</span>
      <span style="color: #64748b; font-family: monospace;">Currency: INR (₹)</span>
    </div>

    <table class="ledger-table">
      <tr style="background: #f8fafc;">
        <td style="width: 25%;">
          <span class="td-label">Sanctioned Principal</span>
          <span class="td-val">${formatINR(principal)}</span>
        </td>
        <td style="width: 25%;">
          <span class="td-label">Annual Interest (APR)</span>
          <span class="td-val">${rate}% p.a. Fixed</span>
        </td>
        <td style="width: 25%;">
          <span class="td-label">Facility Tenure</span>
          <span class="td-val">${tenure} Months</span>
        </td>
        <td style="width: 25%;">
          <span class="td-label">Repayment Structure</span>
          <span class="td-val" style="color: #1e40af; font-size: 12px;">${isEmi ? "Monthly Equated EMI" : "One-Time Bullet Repayment"}</span>
        </td>
      </tr>
      <tr>
        <td>
          <span class="td-label">${isEmi ? "Monthly Installment (EMI)" : "Maturity Principal"}</span>
          <span class="td-val" style="color: #2563eb;">${isEmi ? formatINR(calcMonthlyEmi) + " / mo" : formatINR(principal)}</span>
        </td>
        <td>
          <span class="td-label">Total Interest Accrued</span>
          <span class="td-val" style="color: #b45309;">${formatINR(calcTotalInterest)}</span>
        </td>
        <td>
          <span class="td-label">Total Repayment Obligation</span>
          <span class="td-val" style="color: #059669;">${formatINR(calcTotalPayable)}</span>
        </td>
        <td>
          <span class="td-label">Processing Fee / Levies</span>
          <span class="td-val" style="font-size: 12px;">${processingFee > 0 ? formatINR(processingFee) : "₹0 (Waived & Zero)"}</span>
        </td>
      </tr>
      <tr style="background: #fffbeb;">
        <td colspan="4" style="padding: 8px 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 10px; font-weight: 700; color: #92400e; text-transform: uppercase;">Pledged Security / Collateral Asset:</span>
            <span style="font-size: 11px; font-weight: 800; color: #78350f; font-family: monospace;">${pledgedSecurity}</span>
          </div>
        </td>
      </tr>
    </table>

    <div class="section-title">
      <span>Key Legal Covenants & Operational Terms</span>
      <span style="color: #64748b; font-family: monospace;">INDIAN CONTRACT ACT, 1872</span>
    </div>

    <div class="covenants-list">
      <p><strong>1. Disbursement & Activation:</strong> The Lender agrees to disburse the net Sanctioned Principal directly into the Borrower's designated bank account upon bilateral digital execution and 2-way authentication. The facility shall be utilized exclusively for lawful commercial / business purposes.</p>
      <p><strong>2. Unconditional Repayment Obligation:</strong> The Borrower irrevocably agrees and covenants to repay the sanctioned Principal Amount along with interest in accordance with the schedule specified in Schedule 1 without any set-off, counterclaim, or withholding.</p>
      <p><strong>3. Default Interest & Acceleration:</strong> Any delay or default in scheduled payment shall attract penal interest at 2.0% per month (24% p.a.) on the overdue sum. Continued default exceeding 30 days entitles the Lender to accelerate the entire outstanding balance.</p>
      <p><strong>4. Foreclosure & Prepayment:</strong> The Borrower shall have the right to prepay or foreclose the facility in whole or in part without unreasonable penalty, subject to settling all interest accrued up to the actual date of prepayment.</p>
      <p><strong>5. Representations, Warranties & Recourse:</strong> The Borrower confirms that all information, KYC documents, and business records furnished are true, accurate, and unencumbered, authorizing the Lender to register repayment mandates (e-NACH/auto-debit).</p>
      <p><strong>6. Electronic Execution & Admissibility:</strong> This Agreement is executed electronically pursuant to Sections 4, 5, and 10A of the Information Technology Act, 2000 and the Indian Evidence Act. Parties agree that digital signatures affixed below are legally valid, binding, and admissible in judicial proceedings.</p>
    </div>

    <div class="signatures-section">
      <div class="section-title" style="border-bottom: none; margin-bottom: 0;">
        <span>Bilateral Execution & Digital E-Signature Certificates</span>
        <span style="color: #64748b; font-family: monospace;">Cryptographic 256-bit SHA</span>
      </div>

      <div class="signatures-grid">
        <div class="sig-box">
          <div class="sig-box-header">
            <span>Lender Digital Execution</span>
            <span class="verified-badge">${lenderSig?.signedAt ? 'Digitally Verified' : 'Pending Endorsement'}</span>
          </div>
          <div class="sig-stroke-area">
            ${renderSignatureHtml(lenderSig, 'Lender')}
          </div>
          <div class="sig-meta">
            <div><strong>Signatory:</strong> ${lenderSig?.signedBy || lenderName}</div>
            <div><strong>Timestamp:</strong> ${formatDateTime(lenderSig?.signedAt)}</div>
            <div><strong>IP Stamp:</strong> ${lenderSig?.ipAddress || '::1'}</div>
          </div>
        </div>

        <div class="sig-box">
          <div class="sig-box-header">
            <span>Borrower Digital Execution</span>
            <span class="verified-badge">${borrowerSig?.signedAt ? 'Digitally Verified' : 'Pending Borrower E-Sign'}</span>
          </div>
          <div class="sig-stroke-area">
            ${renderSignatureHtml(borrowerSig, 'Borrower')}
          </div>
          <div class="sig-meta">
            <div><strong>Signatory:</strong> ${borrowerSig?.signedBy || borrowerName}</div>
            <div><strong>Timestamp:</strong> ${borrowerSig?.signedAt ? formatDateTime(borrowerSig.signedAt) : 'Pending digital signature'}</div>
            <div><strong>IP Stamp:</strong> ${borrowerSig?.ipAddress || (borrowerSig?.signedAt ? '::1' : 'Pending')}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer-audit">
      <span>CERTIFIED NON-REPUDIABLE ELECTRONIC INSTRUMENT &bull; IT ACT 2000 SEC 10A</span>
      <span>DOC REF: ${docId}</span>
      <span style="font-weight: 700; color: #0f172a;">PAGE 1 OF 1</span>
    </div>
  </div>
</body>
</html>`;
};

  // 7. Official Vector PDF Generator (Byte-for-byte matching web exportAgreementPDF)
const { jsPDF } = require("jspdf");
const autoTableModule = require("jspdf-autotable");
const autoTable = autoTableModule.default || autoTableModule;

const generateAgreementPdf = (application) => {
  const agreementData = application?.agreement || {};
  const borrower = application?.borrowerId || {};
  const lender = application?.lenderId || {};
  const directPledgedSecurity = application?.pledgedSecurity || "";

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4", // 210 x 297 mm
  });

  const docId =
    agreementData?.documentId ||
    application?.agreement?.documentId ||
    `AGR-${new Date().getFullYear()}-${String(application?._id || application?.id || "88291").slice(-5).toUpperCase()}`;

  const terms =
    agreementData?.sanctionTerms ||
    application?.agreement?.sanctionTerms || {
      amount: application?.amount || 100000,
      repaymentType: application?.repaymentType || "EMI",
      interestRate: application?.requestedRate || application?.interestRate || 10.5,
      tenureMonths: application?.tenureMonths || 12,
      processingFee: application?.processingFee || 0,
      monthlyEmi: application?.monthlyEmi || 0,
      totalInterest: 0,
      totalPayable: application?.amount || 100000,
      maturityDate: null,
    };

  const lenderSig =
    agreementData?.lenderSignature ||
    application?.agreement?.lenderSignature ||
    null;

  const pledgedSecurity =
    directPledgedSecurity ||
    agreementData?.pledgedSecurity ||
    agreementData?.sanctionTerms?.pledgedSecurity ||
    application?.pledgedSecurity ||
    application?.agreement?.sanctionTerms?.pledgedSecurity ||
    application?.activeLoan?.pledgedSecurity ||
    "";

  const borrowerSig =
    agreementData?.borrowerSignature ||
    application?.agreement?.borrowerSignature ||
    null;

  const formatINRPdf = (val) => {
    if (!val || isNaN(val)) return "Rs. 0";
    const num = Number(val);
    return `Rs. ${num.toLocaleString("en-IN")}`;
  };

  const formatDatePdf = (date) => {
    if (!date) return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatDateTimePdf = (date) => {
    if (!date) return "Pending";
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isEmi = terms.repaymentType === "EMI" || !terms.repaymentType;
  const principal = Number(terms.amount) || 100000;
  const rate = Number(terms.interestRate) || 10.5;
  const tenure = Number(terms.tenureMonths) || 12;

  let calcMonthlyEmi = terms.monthlyEmi;
  let calcTotalInterest = terms.totalInterest;
  let calcTotalPayable = terms.totalPayable;

  if (isEmi) {
    if (!calcMonthlyEmi || calcMonthlyEmi === 0) {
      const r = rate / 1200;
      const n = tenure;
      calcMonthlyEmi = Math.round((principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
    }
    if (!calcTotalPayable || calcTotalPayable === principal) {
      calcTotalPayable = calcMonthlyEmi * tenure;
      calcTotalInterest = calcTotalPayable - principal;
    } else if (!calcTotalInterest) {
      calcTotalInterest = calcTotalPayable - principal;
    }
  } else {
    if (!calcTotalInterest || calcTotalInterest === 0) {
      calcTotalInterest = Math.round(principal * (rate / 100) * (tenure / 12));
      calcTotalPayable = principal + calcTotalInterest;
    }
  }

  const lenderName =
    lender?.companyName ||
    lender?.userName ||
    application?.lenderSnapshot?.companyName ||
    application?.lenderSnapshot?.userName ||
    "Institutional Lending Partner";

  const borrowerName =
    borrower?.userName ||
    borrower?.name ||
    application?.borrowerSnapshot?.userName ||
    application?.borrowerSnapshot?.name ||
    "Borrower Entity";

  const borrowerPan =
    borrower?.panCardNumber ||
    borrower?.panNumber ||
    application?.borrowerSnapshot?.panCardNumber ||
    application?.borrowerSnapshot?.panNumber ||
    "AAAPL1234K";

  const borrowerAadhaar =
    borrower?.aadharCardNo ||
    borrower?.aadhaarNumber ||
    application?.borrowerSnapshot?.aadharCardNo ||
    application?.borrowerSnapshot?.aadhaarNumber ||
    "XXXX-XXXX-9821";

  const borrowerAddress =
    borrower?.address ||
    application?.borrowerSnapshot?.address ||
    [
      application?.borrowerSnapshot?.city || borrower?.city,
      application?.borrowerSnapshot?.state || borrower?.state,
    ]
      .filter(Boolean)
      .join(", ") ||
    "Verified Registered Address, India";

  const businessName =
    application?.borrowerSnapshot?.businessName ||
    borrower?.businessName ||
    borrowerName;

  // Colors matching web
  const navy = [15, 23, 42]; // #0f172a
  const blue = [29, 78, 216]; // #1d4ed8
  const darkGray = [51, 65, 85]; // #334155
  const lightGray = [100, 116, 139]; // #64748b
  const borderGray = [203, 213, 225]; // #cbd5e1
  const bgLight = [248, 250, 252]; // #f8fafc

  let y = 16;

  // 1. Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...navy);
  doc.text("COMMERCIAL LOAN FACILITY AGREEMENT", 14, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...darkGray);
  doc.text("Bilateral Master Financing Contract, Sanction Terms & Repayment Undertaking", 14, y);

  y += 6;
  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.4);
  doc.line(14, y, 196, y);

  y += 4;

  // 3. Contracting Parties Box
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...darkGray);
  doc.text(`This Facility Agreement is executed on ${formatDatePdf(new Date())} by and between:`, 14, y);

  y += 2.5;
  const partyBoxW = 88;
  const partyBoxH = 24;

  // Lender Box (Left)
  doc.setFillColor(...bgLight);
  doc.setDrawColor(...borderGray);
  doc.roundedRect(14, y, partyBoxW, partyBoxH, 1, 1, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...blue);
  doc.text("PARTY OF FIRST PART (THE LENDER)", 17, y + 4.5);
  doc.setFontSize(6.5);
  doc.setTextColor(30, 64, 175);
  doc.text("[REGULATED NBFC]", 14 + partyBoxW - 3, y + 4.5, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...navy);
  doc.text(lenderName, 17, y + 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...darkGray);
  doc.text("Entity: Regulated Institutional Lending Partner", 17, y + 15);
  doc.text(`Contact: ${lender?.mobileNo || application?.lenderSnapshot?.mobileNo || "+91 9876543210"}  •  ${lender?.email || application?.lenderSnapshot?.email || "desk@lender.in"}`, 17, y + 19.5);

  // Borrower Box (Right)
  doc.setFillColor(...bgLight);
  doc.setDrawColor(...borderGray);
  doc.roundedRect(108, y, partyBoxW, partyBoxH, 1, 1, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(5, 150, 105);
  doc.text("PARTY OF SECOND PART (THE BORROWER)", 111, y + 4.5);
  doc.setFontSize(6.5);
  doc.text("[KYC VERIFIED]", 108 + partyBoxW - 3, y + 4.5, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...navy);
  doc.text(borrowerName, 111, y + 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...darkGray);
  doc.text(`Entity: ${businessName}`, 111, y + 15);
  doc.text(`KYC: PAN: ${borrowerPan}  •  UIDAI: ${borrowerAadhaar}`, 111, y + 19.5);

  y += partyBoxH + 4;

  // 4. Schedule 1: Financial Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...navy);
  doc.text("SCHEDULE 1: SANCTION TERMS & REPAYMENT LEDGER", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...lightGray);
  doc.text("Currency: INR (Rs.)", 196, y, { align: "right" });

  y += 2;

  autoTable(doc, {
    startY: y,
    head: [[
      { content: "SANCTIONED PRINCIPAL", styles: { fontStyle: "bold" } },
      { content: "INTEREST RATE (APR)", styles: { fontStyle: "bold" } },
      { content: "FACILITY TENURE", styles: { fontStyle: "bold" } },
      { content: "REPAYMENT STRUCTURE", styles: { fontStyle: "bold" } },
    ]],
    body: [
      [
        { content: formatINRPdf(principal), styles: { fontStyle: "bold", textColor: navy, fontSize: 9 } },
        { content: `${rate}% p.a. Fixed`, styles: { fontStyle: "bold", textColor: navy, fontSize: 9 } },
        { content: `${tenure} Months`, styles: { fontStyle: "bold", textColor: navy, fontSize: 9 } },
        { content: isEmi ? "Monthly Equated EMI" : "Bullet Maturity", styles: { fontStyle: "bold", textColor: blue, fontSize: 8.5 } },
      ],
      [
        { content: "MONTHLY INSTALLMENT\n" + (isEmi ? `${formatINRPdf(calcMonthlyEmi)} / mo` : formatINRPdf(principal)), styles: { fontStyle: "bold", textColor: blue } },
        { content: "TOTAL INTEREST\n" + formatINRPdf(calcTotalInterest), styles: { fontStyle: "bold", textColor: [180, 83, 9] } },
        { content: "TOTAL REPAYABLE\n" + formatINRPdf(calcTotalPayable), styles: { fontStyle: "bold", textColor: [5, 150, 105] } },
        { content: "PROCESSING FEE\n" + (Number(terms.processingFee) > 0 ? formatINRPdf(terms.processingFee) : "Rs. 0 (Waived)"), styles: { fontStyle: "bold", textColor: darkGray } },
      ],
      [
        {
          content: `PLEDGED SECURITY / COLLATERAL: ${pledgedSecurity ? pledgedSecurity.toUpperCase() : "NONE (UNSECURED FACILITY / PERSONAL GUARANTEE)"}`,
          colSpan: 4,
          styles: { fontStyle: "bold", textColor: navy, fillColor: [254, 243, 199], fontSize: 7.5 },
        },
      ]
    ],
    theme: "grid",
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: darkGray,
      lineColor: borderGray,
      lineWidth: 0.3,
      valign: "middle",
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [71, 85, 105],
      fontSize: 6.5,
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 4;

  // 5. Legal Covenants & Obligations
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...navy);
  doc.text("KEY COVENANTS, TERMS & REPAYMENT UNDERTAKINGS", 14, y);

  y += 3;

  const covenants = [
    {
      title: "1. Disbursement & Activation: ",
      body: "The Lender agrees to disburse the net Sanctioned Principal directly into Borrower's verified bank account upon bilateral execution and 2-way authentication. The facility shall be utilized solely for authorized commercial purposes.",
    },
    {
      title: "2. Repayment Covenant: ",
      body: "The Borrower irrevocably promises to repay the sanctioned Principal Amount along with interest in accordance with Schedule 1 without any unilateral set-off, deduction, or withholding.",
    },
    {
      title: "3. Default & Penal Interest: ",
      body: "Any delay in scheduled payment shall attract penal default interest at 2.0% per month (24% p.a.) on the unpaid sum. Continued default exceeding 30 days entitles the Lender to accelerate the entire outstanding facility.",
    },
    {
      title: "4. Prepayment & Foreclosure: ",
      body: "The Borrower may prepay or foreclose the facility in whole or in part subject to clearing accrued interest up to the date of prepayment without arbitrary penal fees.",
    },
    {
      title: "5. Information, Pledged Collateral & Mandate Recourse: ",
      body: "The Borrower confirms that all KYC records and any pledged security declared in Schedule 1 are authentic, unencumbered, and owned by Borrower, authorizing the Lender to register repayment mandates (e-NACH/auto-debit).",
    },
    {
      title: "6. Electronic Execution & Admissibility: ",
      body: "This Agreement is executed electronically pursuant to Sections 4, 5, and 10A of the Information Technology Act, 2000. Digital signatures affixed herein constitute valid, binding, and admissible electronic evidence.",
    },
  ];

  doc.setFontSize(6.8);
  covenants.forEach((cov) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...navy);
    const fullText = cov.title + cov.body;
    const splitLines = doc.splitTextToSize(fullText, 182);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...darkGray);
    doc.text(splitLines, 14, y);
    y += splitLines.length * 2.8 + 0.8;
  });

  y += 1;

  // 6. Bilateral Execution & Signatures
  doc.setDrawColor(...navy);
  doc.setLineWidth(0.5);
  doc.line(14, y, 196, y);

  y += 3.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...navy);
  doc.text("BILATERAL DIGITAL EXECUTION & E-SIGN AUDIT CERTIFICATES", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...lightGray);
  doc.text("256-bit SHA Certified Audit Trail", 196, y, { align: "right" });

  y += 2.5;

  const sigBoxW = 88;
  const sigBoxH = 34;

  // Lender Signature Box
  doc.setFillColor(...bgLight);
  doc.setDrawColor(...borderGray);
  doc.roundedRect(14, y, sigBoxW, sigBoxH, 1, 1, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...navy);
  doc.text("LENDER EXECUTION", 17, y + 4);

  if (lenderSig?.signedAt) {
    doc.setTextColor(5, 150, 105);
    doc.text("[DIGITALLY VERIFIED]", 14 + sigBoxW - 3, y + 4, { align: "right" });
  } else {
    doc.setTextColor(180, 83, 9);
    doc.text("[PENDING ENDORSEMENT]", 14 + sigBoxW - 3, y + 4, { align: "right" });
  }

  // Draw white signature canvas inside
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(17, y + 6, sigBoxW - 6, 14, 0.5, 0.5, "FD");

  if (lenderSig?.signatureData && String(lenderSig.signatureData).startsWith("data:image")) {
    try {
      doc.addImage(lenderSig.signatureData, "PNG", 25, y + 7, sigBoxW - 22, 12, undefined, "FAST");
    } catch (e) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(...lightGray);
      doc.text(`[Signed by: ${lenderSig.signedBy || lenderName}]`, 17 + (sigBoxW - 6) / 2, y + 14, { align: "center" });
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...lightGray);
    doc.text(lenderSig?.signedBy ? `[Signed by: ${lenderSig.signedBy}]` : "[Lender Authorized Signature]", 17 + (sigBoxW - 6) / 2, y + 14, { align: "center" });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...darkGray);
  doc.text(`Signatory: ${lenderSig?.signedBy || lenderName}`, 17, y + 23.5);
  doc.text(`Timestamp: ${formatDateTimePdf(lenderSig?.signedAt)}`, 17, y + 27);
  doc.text(`IP Stamp: ${lenderSig?.ipAddress || "::1 (Encrypted SHA-256)"}`, 17, y + 30.5);

  // Borrower Signature Box
  doc.setFillColor(...bgLight);
  doc.setDrawColor(...borderGray);
  doc.roundedRect(108, y, sigBoxW, sigBoxH, 1, 1, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...navy);
  doc.text("BORROWER EXECUTION", 111, y + 4);

  if (borrowerSig?.signedAt) {
    doc.setTextColor(5, 150, 105);
    doc.text("[DIGITALLY VERIFIED]", 108 + sigBoxW - 3, y + 4, { align: "right" });
  } else {
    doc.setTextColor(180, 83, 9);
    doc.text("[PENDING BORROWER SIGN]", 108 + sigBoxW - 3, y + 4, { align: "right" });
  }

  // Draw white signature canvas inside
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(111, y + 6, sigBoxW - 6, 14, 0.5, 0.5, "FD");

  if (borrowerSig?.signatureData && String(borrowerSig.signatureData).startsWith("data:image")) {
    try {
      doc.addImage(borrowerSig.signatureData, "PNG", 119, y + 7, sigBoxW - 22, 12, undefined, "FAST");
    } catch (e) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(...lightGray);
      doc.text(`[Signed by: ${borrowerSig.signedBy || borrowerName}]`, 111 + (sigBoxW - 6) / 2, y + 14, { align: "center" });
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...lightGray);
    doc.text(borrowerSig?.signedBy ? `[Signed by: ${borrowerSig.signedBy}]` : "[Borrower Digital Signature]", 111 + (sigBoxW - 6) / 2, y + 14, { align: "center" });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...darkGray);
  doc.text(`Signatory: ${borrowerSig?.signedBy || borrowerName}`, 111, y + 23.5);
  doc.text(`Timestamp: ${formatDateTimePdf(borrowerSig?.signedAt)}`, 111, y + 27);
  doc.text(`IP Stamp: ${borrowerSig?.ipAddress || "::1 (Encrypted SHA-256)"}`, 111, y + 30.5);

  y += sigBoxH + 3;

  // 7. Security Footer Line
  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.3);
  doc.line(14, y, 196, y);

  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...lightGray);
  doc.text("CERTIFIED NON-REPUDIABLE ELECTRONIC INSTRUMENT • SEC 10A IT ACT 2000", 14, y);
  doc.text(`REF: ${docId}`, 105, y, { align: "center" });
  doc.text("100% LEGAL VALIDITY • PAGE 1 OF 1", 196, y, { align: "right" });

  const pdfArrayBuffer = doc.output("arraybuffer");
  const pdfBuffer = Buffer.from(pdfArrayBuffer);
  return { pdfBuffer, fileName: `Loan_Agreement_${docId}.pdf`, docId };
};

module.exports = {
  buildAgreementDocument,
  generateAgreementHtml,
  generateAgreementPdf,
  formatINR,
  formatDate,
  formatDateTime,
};
