const User = require("../../models/User");
const paginateQuery = require("../../utils/pagination");

/**
 * Get all borrowers with pagination
 * Query params: page, limit
 */
const getAllBorrowers = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const query = { roleId: 2 }; // 2 = borrower role

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
        message: "No borrowers found",
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
    console.error("Error fetching borrowers:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

/**
 * Get borrower by ID
 * Params: id (borrower ID)
 */
const getBorrowerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: "Borrower ID is required",
      });
    }

    const borrower = await User.findOne({
      _id: id,
      roleId: 2, // Ensure it's a borrower
    }).select("-password");

    if (!borrower) {
      return res.status(404).json({
        message: "Borrower not found",
      });
    }

    return res.status(200).json({
      message: "Borrower fetched successfully",
      data: borrower,
    });
  } catch (error) {
    console.error("Error fetching borrower:", error);
    
    // Handle invalid ObjectId format
    if (error.name === "CastError") {
      return res.status(400).json({
        message: "Invalid borrower ID format",
      });
    }

    return res.status(500).json({
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

