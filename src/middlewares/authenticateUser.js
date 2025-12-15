const jwt = require("jsonwebtoken");

const authenticateUser = (req, res, next) => {
    const token = req.headers["authorization"]?.split(" ")[1];;

    if (!token) {
        return res.status(403).json({ message: "No token provided, access denied." });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: "Invalid or expired token." });
        }
        req.user = decoded; // Save decoded user info in the request
        next();
    });
};

module.exports = authenticateUser;
