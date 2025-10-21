import { Router } from "express";
import { verify, checkTopics } from "../controllers/verify.js";
import { issue, issueHealth } from "../controllers/issuance.js";

const router = Router();

router.post("/verify", verify);
router.get("/checktopics", checkTopics);
router.post("/issue", issue);
router.get("/issue/health", issueHealth);

export default router;
