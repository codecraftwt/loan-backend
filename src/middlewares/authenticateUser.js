const jwt = require("jsonwebtoken");

const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "No token provided.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "LoanManagement"
    );

    // DEBUG — yeh console mein dekho
    console.log("=== AUTH DEBUG ===");
    console.log("decoded.id:", decoded.id);
    console.log("decoded.roleId:", decoded.roleId);
    console.log("decoded.isImpersonating:", decoded.isImpersonating);
    console.log("decoded.adminId:", decoded.adminId);
    console.log("==================");

    req.user = {
      id: decoded.id,
      roleId: decoded.roleId,
      isImpersonating: decoded.isImpersonating || false,
      adminId: decoded.adminId || null,
      adminName: decoded.adminName || null,
    };

    next();
  } catch (err) {
    console.error("Token verify failed:", err.message);
    return res.status(401).json({
      success: false,
      message: "Token is not valid or has expired.",
    });
  }
};

module.exports = authenticateUser;