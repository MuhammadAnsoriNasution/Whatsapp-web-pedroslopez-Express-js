const jwt = require("jsonwebtoken")

function validateUser(req, res, next) {
    try {
        const token = req.headers?.authorization ?? ''
        const decode = jwt.verify(token.replace("Bearer ", ''), process.env.SECRET_TOKEN)
        req.user = decode
        next()
    } catch (error) {
        return res.status(401).json({
            status: false,
            message: "Unauthorized"
        })
    }
}

module.exports = {
    validateUser
}