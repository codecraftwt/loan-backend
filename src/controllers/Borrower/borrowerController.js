const User = require("../../models/User");
const Loan = require("../../models/Loan");
const mongoose = require("mongoose");
const paginateQuery = require("../../utils/pagination");
const { getBorrowerReputation } = require("../../services/reputationScoringService");

/**
 * Get all borrowers with pagination
 * Query params: page, limit
 */
const getAllBorrowers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;

    const query = { roleId: 2 }; // 2 = borrower role

    if (search && search.trim()) {
      const searchTerm = search.trim();
      query.$or = [
        { userName: { $regex: searchTerm, $options: "i" } },
        { aadharCardNo: { $regex: searchTerm, $options: "i" } },
        { mobileNo: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const options = {
      sort: { createdAt: -1 },
      select: "-password",
    };

    const { data: borrowers, pagination } = await paginateQuery(
      User,
      query,
      page,
      limit,
      options
    );

    return res.status(200).json({
      message: "Borrowers fetched successfully",
      data: borrowers || [],
      pagination,
    });
  } catch (error) {
    console.error("Error fetching borrowers:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

/**
 * Get borrower by ID or Aadhaar
 * Params: id (borrower ID or Aadhaar number)
 * Query params: includeReputation (optional, default: false) - include reputation score
 */
const getBorrowerById = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeReputation } = req.query;

    if (!id) {
      return res.status(400).json({
        message: "Borrower ID is required",
      });
    }

    let borrower = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      borrower = await User.findOne({ _id: id, roleId: 2 }).select("-password");
    }
    if (!borrower) {
      borrower = await User.findOne({
        $or: [{ aadharCardNo: id }, { mobileNo: id }, { _id: mongoose.Types.ObjectId.isValid(id) ? id : null }],
        roleId: 2,
      }).select("-password");
    }

    // Also check if any user exists with that ID or lookup in loans
    let loans = [];
    const loanQuery = [];
    if (borrower) {
      loanQuery.push({ borrowerId: borrower._id });
      if (borrower.aadharCardNo) loanQuery.push({ aadhaarNumber: borrower.aadharCardNo });
      if (borrower.mobileNo) loanQuery.push({ mobileNumber: borrower.mobileNo });
    } else {
      if (mongoose.Types.ObjectId.isValid(id)) loanQuery.push({ borrowerId: id });
      loanQuery.push({ aadhaarNumber: id });
      loanQuery.push({ mobileNumber: id });
    }

    loans = await Loan.find({ $or: loanQuery }).sort({ createdAt: -1 }).lean();

    if (!borrower && loans.length === 0) {
      return res.status(404).json({
        message: "Borrower not found",
      });
    }

    const borrowerName = borrower?.userName || loans[0]?.name || "Borrower";
    const aadhaarNo = borrower?.aadharCardNo || loans[0]?.aadhaarNumber || "N/A";
    const mobileNo = borrower?.mobileNo || loans[0]?.mobileNumber || "N/A";

    const totalLoansCount = loans.length;
    const totalLoanAmount = loans.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const totalPaidAmount = loans.reduce((s, l) => s + (Number(l.totalPaid) || 0), 0);
    const totalRemainingAmount = loans.reduce((s, l) => s + (Number(l.remainingAmount) || 0), 0);
    const hasActiveLoan = loans.some((l) => l.paymentStatus === "pending" || l.paymentStatus === "part paid");
    const hasOverdueLoan = loans.some((l) => l.paymentStatus === "overdue");

    const responseData = {
      ...(borrower ? borrower.toObject() : {}),
      _id: borrower?._id || loans[0]?.borrowerId || id,
      borrowerName,
      userName: borrowerName,
      name: borrowerName,
      aadharCardNo: aadhaarNo,
      aadhaarNumber: aadhaarNo,
      mobileNo,
      mobileNumber: mobileNo,
      email: borrower?.email || `${borrowerName.toLowerCase().replace(/\s+/g, "")}@example.com`,
      address: borrower?.address || loans[0]?.address || "Address on file",
      loans: loans.map((l) => ({
        loanId: l._id,
        _id: l._id,
        amount: l.amount,
        totalPaid: l.totalPaid,
        remainingAmount: l.remainingAmount,
        remainigAmount: l.remainingAmount,
        paymentStatus: l.paymentStatus,
        loanGivenDate: l.loanGivenDate || l.createdAt,
        loanEndDate: l.loanEndDate,
        purpose: l.purpose || l.dealName || "Commercial Loan",
        dealName: l.dealName || l.purpose || "Commercial Loan",
      })),
      totalLoansCount,
      totalLoanAmount,
      totalPaidAmount,
      totalRemainingAmount,
      hasActiveLoan,
      hasOverdueLoan,
    };

    // Optionally include reputation score
    if (includeReputation === "true" && aadhaarNo && aadhaarNo !== "N/A") {
      try {
        const reputation = await getBorrowerReputation(aadhaarNo);
        responseData.reputation = reputation;
      } catch (reputationError) {
        console.error("Error fetching borrower reputation:", reputationError);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Borrower fetched successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Error fetching borrower:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

/**
 * Search borrowers by name, Aadhar number, or phone number
 * Query params: search (searches in userName, aadharCardNo, mobileNo), page, limit
 */
const searchBorrowers = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    if (!search || search.trim() === "") {
      return res.status(400).json({
        message: "Search query is required",
      });
    }

    const searchTerm = search.trim();

    // Build search query for borrower name, Aadhar number, or phone number
    const query = {
      roleId: 2, // Only borrowers
      $or: [
        { userName: { $regex: searchTerm, $options: "i" } }, // Case-insensitive name search
        { aadharCardNo: searchTerm }, // Exact match for Aadhar
        { mobileNo: { $regex: searchTerm, $options: "i" } }, // Case-insensitive phone search
      ],
    };

    const options = {
      sort: { createdAt: -1 },
      select: "-password", // Exclude password from response
    };

    const { data: borrowers, pagination } = await paginateQuery(
      User,
      query,
      page,
      limit,
      options
    );

    if (!borrowers.length) {
      return res.status(404).json({
        message: "No borrowers found matching the search criteria",
        data: [],
        pagination,
      });
    }

    return res.status(200).json({
      message: "Borrowers fetched successfully",
      data: borrowers,
      pagination,
    });
  } catch (error) {
    console.error("Error searching borrowers:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

module.exports = {
  getAllBorrowers,
  getBorrowerById,
  searchBorrowers,
};

