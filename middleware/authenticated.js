const jwt = require("jsonwebtoken")
var listToken = require("../list_token.json")
function validateUser(req, res, next) {
    try {
        const token = req.headers?.authorization.replace("Bearer ", '') ?? ''
        const tokenExpired = listToken.find((token) => token.token)
        const decode = jwt.verify(token, process.env.SECRET_TOKEN)
        req.user = decode
        next()
    } catch (error) {
        return res.status(401).json({
            status: false,
            message: "Unauthorized"
        })
    }
}

function validateRefreshTokenUser(req, res, next) {
    try {
        const token = req.headers?.authorization.replace("Bearer ", '') ?? ''
        const decode = jwt.verify(token, process.env.SECRET_REFRESH_TOKEN)
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
    validateUser,
    validateRefreshTokenUser
}