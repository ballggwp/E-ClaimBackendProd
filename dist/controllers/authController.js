"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.loginLimiter = void 0;
exports.fetchAzureToken = fetchAzureToken;
exports.fetchUserInfoProfile = fetchUserInfoProfile;
exports.fetchUserInfoProfilesByKeyword = fetchUserInfoProfilesByKeyword;
const prisma_1 = __importDefault(require("../lib/prisma"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const axios_1 = __importDefault(require("axios"));
exports.loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: "Too many login attempts, please try again later.",
});
async function fetchAzureToken() {
    try {
        const res = await axios_1.default.post(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, new URLSearchParams({
            client_id: process.env.AZURE_CLIENT_ID,
            client_secret: process.env.AZURE_CLIENT_SECRET,
            scope: process.env.AZURE_SCOPE,
            grant_type: "client_credentials",
        }).toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        return res.data.access_token;
    }
    catch (err) {
        throw new Error("Failed to fetch Azure access token");
    }
}
async function fetchUserInfoProfileWithPassword(email, password, azureToken) {
    // 1) authenticate upstream
    const authRes = await axios_1.default.post(`https://${process.env.SERVICE_HOST}/userinfo/api/v2/authen`, { email, password }, {
        headers: {
            Authorization: `Bearer ${azureToken}`,
            "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY,
            "Content-Type": "application/json",
        },
    });
    // 2) explicitly verify the API-level success code
    const { code, message, result } = authRes.data;
    if (code !== 200) {
        throw new Error(message || result?.error || "Invalid credentials");
    }
    // 3) fetch the user profile
    const profileRes = await axios_1.default.post(`https://${process.env.SERVICE_HOST}/userinfo/api/v2/profile`, { email }, {
        headers: {
            Authorization: `Bearer ${azureToken}`,
            "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY,
            "Content-Type": "application/json",
        },
    });
    const profile = profileRes.data.result?.[0];
    if (!profile) {
        throw new Error("No profile returned");
    }
    return profile;
}
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        // 1) Get an Azure AD token and verify credentials upstream
        const azureToken = await fetchAzureToken();
        const profile = await fetchUserInfoProfileWithPassword(email, password, azureToken);
        // 2) Upsert local user record
        const empNo = String(profile.id);
        const [deptTh, deptEn, posEn, posTh] = [
            profile.department?.name.th,
            profile.department?.name.en,
            profile.position?.name.en,
            profile.position?.name.th,
        ];
        if (!deptTh || !deptEn || !posEn || !posTh) {
            res.status(500).json({ message: "Incomplete profile data" });
            return; // ← return void, not return the response
        }
        // determine role
        let role = "USER";
        if (/Insurance Officer/i.test(posEn) && /Insurance/i.test(deptEn)) {
            role = "INSURANCE";
        }
        else if (/Manager/i.test(posEn) && /Insurance/i.test(deptEn)) {
            role = "MANAGER";
        }
        const name = profile.employeeName?.th ?? profile.employeeName?.en ?? "Unknown";
        const user = await prisma_1.default.user.upsert({
            where: { employeeNumber: empNo },
            create: {
                name,
                email,
                role,
                position: posTh,
                department: deptTh, // store department in English
                employeeNumber: empNo,
            },
            update: {
                email,
                position: posTh,
                department: deptTh,
                // you could update role here if you wish
            },
        });
        // 3) Issue your own JWT
        const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, employeeNumber: empNo, name: user.name }, process.env.JWT_SECRET, { expiresIn: "8h" });
        res.json({ user, token });
    }
    catch (err) {
        // on invalid credentials (or any other error), bubble up to your error handler
        next(err);
    }
};
exports.login = login;
// (Optional) If you also rely on the no-password variant, update it similarly:
async function fetchUserInfoProfile(email) {
    const azureToken = await fetchAzureToken();
    // 3) fetch profile
    const profileRes = await axios_1.default.post(`https://${process.env.SERVICE_HOST}/userinfo/api/v2/profile`, { email }, {
        headers: {
            Authorization: `Bearer ${azureToken}`,
            "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY,
            "Content-Type": "application/json",
        },
    });
    const profile = profileRes.data.result?.[0];
    if (!profile) {
        throw new Error(`No profile found for ${email}`);
    }
    return profile;
}
async function fetchUserInfoProfilesByKeyword(keyword) {
    const azureToken = await fetchAzureToken();
    const res = await axios_1.default.post(`https://${process.env.SERVICE_HOST}/userinfo/api/v2/profile`, { keyword }, {
        headers: {
            Authorization: `Bearer ${azureToken}`,
            "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY,
            "Content-Type": "application/json",
        },
    });
    const result = res.data.result;
    if (!Array.isArray(result)) {
        throw new Error("Profile search returned unexpected data");
    }
    return result;
}
