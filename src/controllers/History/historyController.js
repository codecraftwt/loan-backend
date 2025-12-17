const Loan = require("../../models/Loan");
const User = require("../../models/User");
const paginateQuery = require("../../utils/pagination");

/**
 * Get all borrowers history without any lender or borrower id filter
 * Returns all loans in the system with borrower and lender details
 */
const getAllBorrowersHistory = async (req, res) => {
  try {
    const { page, limit, startDate, endDate, status, minAmount, maxAmount, search } = req.query;

    const query = {};

    // Add filters
    if (startDate) query.loanGivenDate = { ...query.loanGivenDate, $gte: new Date(startDate) };
    if (endDate) query.loanEndDate = { ...query.loanEndDate, $lte: new Date(endDate) };
    if (status) query.status = status;
    if (minAmount !== undefined || maxAmount !== undefined) {
      query.amount = {};
      if (minAmount !== undefined) query.amount.$gte = Number(minAmount);
      if (maxAmount !== undefined) query.amount.$lte = Number(maxAmount);
    }

    // Add name search if provided
    if (search) {
      query.name = { $regex: search, $options: 'i' }; // Case-insensitive search
    }

    // Create options for paginateQuery with population
    const options = {
      sort: { createdAt: -1 },
      populate: [
        {
          path: 'lenderId',
          select: 'userName email mobileNo profileImage aadharCardNo',
        },
        {
          path: 'borrowerId',
          select: 'userName email mobileNo profileImage aadharCardNo',
          strictPopulate: false, // Allow populate even if borrowerId is null
        }
      ]
    };

    const { data: loans, pagination } = await paginateQuery(
      Loan,
      query,
      page,
      limit,
      options
    );

    if (!loans.length) {
      return res.status(404).json({
        success: false,
        message: "No borrower history found",
        data: [],
        pagination,
      });
    }

    return res.status(200).json({
      success: true,
      message: "All borrowers history fetched successfully",
      data: loans,
      pagination,
    });
  } catch (error) {
    console.error("Error fetching all borrowers history:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

/**
 * Get borrower history by lender ID
 * Returns all loans given by a specific lender
 */
const getBorrowerHistoryByLenderId = async (req, res) => {
  try {
    const { lenderId } = req.params;
    const { page, limit, startDate, endDate, status, minAmount, maxAmount, search } = req.query;

    // Validate lenderId
    if (!lenderId) {
      return res.status(400).json({
        success: false,
        message: "Lender ID is required",
      });
    }

    // Check if lender exists
    const lender = await User.findById(lenderId);
    if (!lender) {
      return res.status(404).json({
        success: false,
        message: "Lender not found",
      });
    }

    const query = { lenderId };

    // Add filters
    if (startDate) query.loanGivenDate = { ...query.loanGivenDate, $gte: new Date(startDate) };
    if (endDate) query.loanEndDate = { ...query.loanEndDate, $lte: new Date(endDate) };
    if (status) query.status = status;
    if (minAmount !== undefined || maxAmount !== undefined) {
      query.amount = {};
      if (minAmount !== undefined) query.amount.$gte = Number(minAmount);
      if (maxAmount !== undefined) query.amount.$lte = Number(maxAmount);
    }

    // Add name search if provided
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Create options for paginateQuery with population
    const options = {
      sort: { createdAt: -1 },
      populate: [
        {
          path: 'lenderId',
          select: 'userName email mobileNo profileImage aadharCardNo',
        },
        {
          path: 'borrowerId',
          select: 'userName email mobileNo profileImage aadharCardNo',
          strictPopulate: false,
        }
      ]
    };

    const { data: loans, pagination } = await paginateQuery(
      Loan,
      query,
      page,
      limit,
      options
    );

    if (!loans.length) {
      return res.status(404).json({
        success: false,
        message: `No borrower history found for lender ID: ${lenderId}`,
        data: [],
        pagination,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Borrower history fetched successfully",
      lender: {
        _id: lender._id,
        userName: lender.userName,
        email: lender.email,
        mobileNo: lender.mobileNo,
      },
      data: loans,
      pagination,
    });
  } catch (error) {
    console.error("Error fetching borrower history by lender ID:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

/**
 * Get borrower history by borrower ID
 * Returns all loans taken by a specific borrower
 */
const getBorrowerHistoryByBorrowerId = async (req, res) => {
  try {
    const { borrowerId } = req.params;
    const { page, limit, startDate, endDate, status, minAmount, maxAmount, search } = req.query;

    // Validate borrowerId
    if (!borrowerId) {
      return res.status(400).json({
        success: false,
        message: "Borrower ID is required",
      });
    }

    // Check if borrower exists
    const borrower = await User.findById(borrowerId);
    if (!borrower) {
      return res.status(404).json({
        success: false,
        message: "Borrower not found",
      });
    }

    const query = { borrowerId };

    // Add filters
    if (startDate) query.loanGivenDate = { ...query.loanGivenDate, $gte: new Date(startDate) };
    if (endDate) query.loanEndDate = { ...query.loanEndDate, $lte: new Date(endDate) };
    if (status) query.status = status;
    if (minAmount !== undefined || maxAmount !== undefined) {
      query.amount = {};
      if (minAmount !== undefined) query.amount.$gte = Number(minAmount);
      if (maxAmount !== undefined) query.amount.$lte = Number(maxAmount);
    }

    // Add name search if provided (searching in lender name)
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Create options for paginateQuery with population
    const options = {
      sort: { createdAt: -1 },
      populate: [
        {
          path: 'lenderId',
          select: 'userName email mobileNo profileImage aadharCardNo',
        },
        {
          path: 'borrowerId',
          select: 'userName email mobileNo profileImage aadharCardNo',
          strictPopulate: false,
        }
      ]
    };

    const { data: loans, pagination } = await paginateQuery(
      Loan,
      query,
      page,
      limit,
      options
    );

    if (!loans.length) {
      return res.status(404).json({
        success: false,
        message: `No borrower history found for borrower ID: ${borrowerId}`,
        data: [],
        pagination,
      });
    }

    // Calculate summary statistics
    const pendingLoans = loans.filter(loan => loan.status === 'pending');
    const paidLoans = loans.filter(loan => loan.status === 'paid');
    const totalPendingAmount = pendingLoans.reduce((sum, loan) => sum + loan.amount, 0);
    const totalPaidAmount = paidLoans.reduce((sum, loan) => sum + loan.amount, 0);

    return res.status(200).json({
      success: true,
      message: "Borrower history fetched successfully",
      borrower: {
        _id: borrower._id,
        userName: borrower.userName,
        email: borrower.email,
        mobileNo: borrower.mobileNo,
        aadharCardNo: borrower.aadharCardNo,
      },
      summary: {
        totalLoans: loans.length,
        pendingLoans: pendingLoans.length,
        paidLoans: paidLoans.length,
        totalPendingAmount,
        totalPaidAmount,
      },
      data: loans,
      pagination,
    });
  } catch (error) {
    console.error("Error fetching borrower history by borrower ID:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

/**
 * Get borrower history by both borrower ID and lender ID
 * Returns loans between a specific borrower and lender
 */
const getBorrowerHistoryByBorrowerAndLenderId = async (req, res) => {
  try {
    const { borrowerId, lenderId } = req.params;
    const { page, limit, startDate, endDate, status, minAmount, maxAmount, search } = req.query;

    // Validate IDs
    if (!borrowerId || !lenderId) {
      return res.status(400).json({
        success: false,
        message: "Both borrower ID and lender ID are required",
      });
    }

    // Check if borrower exists
    const borrower = await User.findById(borrowerId);
    if (!borrower) {
      return res.status(404).json({
        success: false,
        message: "Borrower not found",
      });
    }

    // Check if lender exists
    const lender = await User.findById(lenderId);
    if (!lender) {
      return res.status(404).json({
        success: false,
        message: "Lender not found",
      });
    }

    const query = {
      borrowerId,
      lenderId,
    };

    // Add filters
    if (startDate) query.loanGivenDate = { ...query.loanGivenDate, $gte: new Date(startDate) };
    if (endDate) query.loanEndDate = { ...query.loanEndDate, $lte: new Date(endDate) };
    if (status) query.status = status;
    if (minAmount !== undefined || maxAmount !== undefined) {
      query.amount = {};
      if (minAmount !== undefined) query.amount.$gte = Number(minAmount);
      if (maxAmount !== undefined) query.amount.$lte = Number(maxAmount);
    }

    // Add name search if provided
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Create options for paginateQuery with population
    const options = {
      sort: { createdAt: -1 },
      populate: [
        {
          path: 'lenderId',
          select: 'userName email mobileNo profileImage aadharCardNo',
        },
        {
          path: 'borrowerId',
          select: 'userName email mobileNo profileImage aadharCardNo',
          strictPopulate: false,
        }
      ]
    };

    const { data: loans, pagination } = await paginateQuery(
      Loan,
      query,
      page,
      limit,
      options
    );

    if (!loans.length) {
      return res.status(404).json({
        success: false,
        message: `No loans found between borrower ID: ${borrowerId} and lender ID: ${lenderId}`,
        data: [],
        pagination,
      });
    }

    // Calculate summary statistics
    const pendingLoans = loans.filter(loan => loan.status === 'pending');
    const paidLoans = loans.filter(loan => loan.status === 'paid');
    const totalPendingAmount = pendingLoans.reduce((sum, loan) => sum + loan.amount, 0);
    const totalPaidAmount = paidLoans.reduce((sum, loan) => sum + loan.amount, 0);

    return res.status(200).json({
      success: true,
      message: "Borrower history fetched successfully",
      borrower: {
        _id: borrower._id,
        userName: borrower.userName,
        email: borrower.email,
        mobileNo: borrower.mobileNo,
      },
      lender: {
        _id: lender._id,
        userName: lender.userName,
        email: lender.email,
        mobileNo: lender.mobileNo,
      },
      summary: {
        totalLoans: loans.length,
        pendingLoans: pendingLoans.length,
        paidLoans: paidLoans.length,
        totalPendingAmount,
        totalPaidAmount,
      },
      data: loans,
      pagination,
    });
  } catch (error) {
    console.error("Error fetching borrower history by borrower and lender ID:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

/**
 * Get all loans given by a lender (by lender ID)
 * Returns all loans given by a specific lender
 */
const getAllLoansByLenderId = async (req, res) => {
  try {
    const { lenderId } = req.params;
    const { page, limit, startDate, endDate, status, minAmount, maxAmount, search } = req.query;

    // Validate lenderId
    if (!lenderId) {
      return res.status(400).json({
        success: false,
        message: "Lender ID is required",
      });
    }

    // Check if lender exists
    const lender = await User.findById(lenderId);
    if (!lender) {
      return res.status(404).json({
        success: false,
        message: "Lender not found",
      });
    }

    const query = { lenderId };

    // Add filters
    if (startDate) query.loanGivenDate = { ...query.loanGivenDate, $gte: new Date(startDate) };
    if (endDate) query.loanEndDate = { ...query.loanEndDate, $lte: new Date(endDate) };
    if (status) query.status = status;
    if (minAmount !== undefined || maxAmount !== undefined) {
      query.amount = {};
      if (minAmount !== undefined) query.amount.$gte = Number(minAmount);
      if (maxAmount !== undefined) query.amount.$lte = Number(maxAmount);
    }

    // Add name search if provided
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Create options for paginateQuery with population
    const options = {
      sort: { createdAt: -1 },
      populate: [
        {
          path: 'lenderId',
          select: 'userName email mobileNo profileImage aadharCardNo',
        },
        {
          path: 'borrowerId',
          select: 'userName email mobileNo profileImage aadharCardNo',
          strictPopulate: false,
        }
      ]
    };

    const { data: loans, pagination } = await paginateQuery(
      Loan,
      query,
      page,
      limit,
      options
    );

    if (!loans.length) {
      return res.status(404).json({
        success: false,
        message: `No loans found for lender ID: ${lenderId}`,
        data: [],
        pagination,
      });
    }

    // Calculate summary statistics
    const pendingLoans = loans.filter(loan => loan.status === 'pending');
    const paidLoans = loans.filter(loan => loan.status === 'paid');
    const totalPendingAmount = pendingLoans.reduce((sum, loan) => sum + loan.amount, 0);
    const totalPaidAmount = paidLoans.reduce((sum, loan) => sum + loan.amount, 0);
    const totalLoanAmount = loans.reduce((sum, loan) => sum + loan.amount, 0);

    return res.status(200).json({
      success: true,
      message: "All loans by lender fetched successfully",
      lender: {
        _id: lender._id,
        userName: lender.userName,
        email: lender.email,
        mobileNo: lender.mobileNo,
      },
      summary: {
        totalLoans: loans.length,
        pendingLoans: pendingLoans.length,
        paidLoans: paidLoans.length,
        totalLoanAmount,
        totalPendingAmount,
        totalPaidAmount,
      },
      data: loans,
      pagination,
    });
  } catch (error) {
    console.error("Error fetching all loans by lender ID:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

module.exports = {
  getAllBorrowersHistory,
  getBorrowerHistoryByLenderId,
  getBorrowerHistoryByBorrowerId,
  getBorrowerHistoryByBorrowerAndLenderId,
  getAllLoansByLenderId,
};


