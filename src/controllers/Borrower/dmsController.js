const Document = require("../../models/Document");
const Loan = require("../../models/Loan");
const AuditLog = require("../../models/AuditLog");
const { processDocumentAI } = require("../../services/aiUnderwritingService");

// Standard document checklist requirement matrix by loan purpose
const REQUIRED_DOCS_MATRIX = {
  fix_and_flip: [
    { category: "financials", docType: "bank_statement", title: "Last 3 Months Bank Statements (Liquid Reserves)", required: true },
    { category: "financials", docType: "tax_return", title: "Last 2 Years Tax Returns / 1040s", required: true },
    { category: "property", docType: "purchase_contract", title: "Executed Purchase & Sale Agreement", required: true },
    { category: "property", docType: "scope_of_work", title: "Itemized Contractor Scope of Work & Budget", required: true },
    { category: "property", docType: "appraisal_report", title: "As-Is & ARV Appraisal Report", required: false },
    { category: "legal_entity", docType: "llc_operating_agreement", title: "LLC Operating Agreement & Articles of Org", required: true },
    { category: "legal_entity", docType: "kyc_id", title: "Government ID / Driver's License for Principals", required: true },
    { category: "closing", docType: "title_commitment", title: "Preliminary Title Report & Commitment", required: false },
  ],
  acquisition: [
    { category: "financials", docType: "bank_statement", title: "Last 3 Months Bank Statements", required: true },
    { category: "financials", docType: "tax_return", title: "Last 2 Years Business / Personal Tax Returns", required: true },
    { category: "property", docType: "purchase_contract", title: "Executed Purchase Contract", required: true },
    { category: "property", docType: "appraisal_report", title: "Commercial Appraisal Report", required: false },
    { category: "legal_entity", docType: "llc_operating_agreement", title: "Entity Operating Agreement & EIN Letter", required: true },
    { category: "legal_entity", docType: "kyc_id", title: "Sponsor Government Issued ID", required: true },
  ],
  refinance: [
    { category: "financials", docType: "bank_statement", title: "Bank Statements", required: true },
    { category: "financials", docType: "pnl_statement", title: "Trailing 12-Month Operating P&L / Rent Roll", required: true },
    { category: "property", docType: "appraisal_report", title: "Commercial Appraisal / Valuation", required: false },
    { category: "legal_entity", docType: "llc_operating_agreement", title: "Entity Formation Documents", required: true },
    { category: "closing", docType: "title_commitment", title: "Existing Mortgage Payoff Statement & Title", required: true },
  ],
  ground_up_construction: [
    { category: "financials", docType: "bank_statement", title: "Proof of Funds & Bank Statements", required: true },
    { category: "property", docType: "scope_of_work", title: "Architectural Plans & Line-Item Budget", required: true },
    { category: "property", docType: "purchase_contract", title: "Land Deed / Purchase Agreement", required: true },
    { category: "legal_entity", docType: "llc_operating_agreement", title: "Corporate Entity Docs", required: true },
  ],
  bridge: [
    { category: "financials", docType: "bank_statement", title: "Liquidity & Reserve Statements", required: true },
    { category: "property", docType: "purchase_contract", title: "Purchase or Refinance Documents", required: true },
    { category: "legal_entity", docType: "llc_operating_agreement", title: "Borrower Entity Formation Papers", required: true },
  ],
};

/**
 * Upload & register document into DMS with automatic AI analysis
 */
exports.uploadDocument = async (req, res) => {
  try {
    const {
      loanId,
      category = "financials",
      docType = "other",
      title,
      fileName,
      fileUrl,
      fileSize = 0,
      mimeType = "application/pdf",
    } = req.body;

    if (!loanId) {
      return res.status(400).json({ success: false, message: "Loan ID is required." });
    }

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ success: false, message: "Loan not found." });
    }

    const docTitle = title || fileName || `${docType.replace(/_/g, " ").toUpperCase()}`;
    const resolvedUrl = fileUrl || (req.file ? req.file.path : "https://res.cloudinary.com/demo/image/upload/sample.pdf");

    // Run AI OCR extraction
    const aiResult = await processDocumentAI({
      docType,
      fileName: fileName || docTitle,
      title: docTitle,
    });

    const newDoc = await Document.create({
      loanId,
      uploadedBy: req.user.id,
      lenderId: loan.lenderId || null,
      category,
      docType,
      title: docTitle,
      fileName: fileName || docTitle,
      fileUrl: resolvedUrl,
      fileSize,
      mimeType,
      status: "under_review",
      aiExtraction: aiResult,
    });

    // Auto update pipeline stage to doc_collection if it was intake
    if (loan.pipelineStage === "intake") {
      loan.pipelineStage = "doc_collection";
      await loan.save();
    }

    await AuditLog.create({
      loanId,
      userId: req.user.id,
      userRole: Number(req.user.roleId) === 2 ? "borrower" : "lender",
      action: "UPLOADED_DOCUMENT",
      module: "documents",
      details: `Uploaded document: ${docTitle} (${docType})`,
    });

    return res.status(201).json({
      success: true,
      message: "Document uploaded and processed by AI review engine.",
      data: newDoc,
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload document.",
      error: error.message,
    });
  }
};

/**
 * Get all DMS documents for a loan
 */
exports.getDocumentsByLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    const documents = await Document.find({ loanId }).populate("uploadedBy", "userName email roleId");

    const grouped = {
      financials: [],
      property: [],
      legal_entity: [],
      closing: [],
      other: [],
    };

    documents.forEach((doc) => {
      const cat = doc.category || "other";
      if (grouped[cat]) grouped[cat].push(doc);
      else grouped.other.push(doc);
    });

    return res.status(200).json({
      success: true,
      data: {
        documents,
        grouped,
        total: documents.length,
        verifiedCount: documents.filter((d) => d.status === "verified").length,
        pendingCount: documents.filter((d) => d.status === "pending" || d.status === "under_review").length,
      },
    });
  } catch (error) {
    console.error("Error fetching documents:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch loan documents.",
      error: error.message,
    });
  }
};

/**
 * Verify or Reject a document
 */
exports.verifyDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { status, rejectionReason } = req.body;

    if (!["verified", "rejected", "under_review", "pending"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value." });
    }

    const doc = await Document.findById(documentId);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Document not found." });
    }

    doc.status = status;
    doc.rejectionReason = status === "rejected" ? rejectionReason || "Document does not satisfy requirements" : null;
    doc.verifiedBy = req.user.id;
    doc.verifiedAt = new Date();
    await doc.save();

    await AuditLog.create({
      loanId: doc.loanId,
      userId: req.user.id,
      userRole: "lender",
      action: status === "verified" ? "VERIFIED_DOCUMENT" : "REJECTED_DOCUMENT",
      module: "documents",
      details: `Marked '${doc.title}' as ${status}. ${rejectionReason ? `Reason: ${rejectionReason}` : ""}`,
    });

    return res.status(200).json({
      success: true,
      message: `Document status updated to ${status}`,
      data: doc,
    });
  } catch (error) {
    console.error("Error verifying document:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify document.",
      error: error.message,
    });
  }
};

/**
 * Get dynamic document checklist for a loan
 */
exports.getDocumentChecklist = async (req, res) => {
  try {
    const { loanId } = req.params;
    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ success: false, message: "Loan not found." });
    }

    const purpose = loan.loanPurpose || "fix_and_flip";
    const template = REQUIRED_DOCS_MATRIX[purpose] || REQUIRED_DOCS_MATRIX.fix_and_flip;

    const uploadedDocs = await Document.find({ loanId });

    const checklist = template.map((item) => {
      const match = uploadedDocs.find((d) => d.docType === item.docType);
      return {
        ...item,
        isUploaded: Boolean(match),
        document: match || null,
        status: match ? match.status : "pending_upload",
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        loanPurpose: purpose,
        checklist,
        completionPercentage: Math.round(
          (checklist.filter((i) => i.isUploaded && i.status === "verified").length /
            Math.max(1, checklist.filter((i) => i.required).length)) *
            100
        ),
      },
    });
  } catch (error) {
    console.error("Error fetching checklist:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch document checklist.",
      error: error.message,
    });
  }
};
