import { Router } from "express";
import { verify } from "../controllers/verify.js";
import { issue, issueHealth, updateCredentialStatus } from "../controllers/issuance.js";

const router = Router();

router.post("/verify", verify);
router.post("/issue", issue);
router.post("/issue/status", updateCredentialStatus);
router.get("/issue/health", issueHealth);

export default router;
