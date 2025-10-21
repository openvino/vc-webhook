import { Router } from "express";
import { verify } from "../controllers/verify.js";
import { issue, issueHealth } from "../controllers/issuance.js";

const router = Router();

router.post("/verify", verify);
router.post("/issue", issue);
router.get("/issue/health", issueHealth);

export default router;
